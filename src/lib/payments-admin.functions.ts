import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "./stripe.server";

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const listSchema = z.object({
  source: z.enum(["all", "donation", "coaching", "manual"]).optional(),
  status: z.enum(["all", "refunded", "not_refunded", "partial"]).optional(),
  q: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

/**
 * List every registered payment/donation across users with joined profile info.
 * Admins can filter by source, refund status and search by name.
 */
export const listAllPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => listSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = (supabaseAdmin as any)
      .from("donations")
      .select(
        "id, user_id, amount_dkk, refunded_amount_dkk, refunded_at, stripe_refund_id, source, note, donated_at, stripe_session_id, stripe_payment_intent_id, environment, created_by",
      )
      .order("donated_at", { ascending: false })
      .limit(data.limit ?? 200);

    if (data.source && data.source !== "all") {
      if (data.source === "manual") {
        query = query.is("stripe_payment_intent_id", null);
      } else {
        query = query.eq("source", data.source);
      }
    }
    if (data.status === "refunded") query = query.not("refunded_at", "is", null);
    if (data.status === "not_refunded") query = query.is("refunded_at", null);
    if (data.status === "partial")
      query = query.not("refunded_at", "is", null);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const rowList = (rows ?? []) as any[];
    const userIds = Array.from(new Set(rowList.map((r) => r.user_id).filter(Boolean)));
    let profilesById = new Map<string, { display_name: string | null; lmu_name: string | null; donation_tier: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await (supabaseAdmin as any)
        .from("profiles")
        .select("id, display_name, lmu_name, donation_tier")
        .in("id", userIds);
      for (const p of (profiles ?? []) as any[]) {
        profilesById.set(p.id, { display_name: p.display_name, lmu_name: p.lmu_name, donation_tier: p.donation_tier });
      }
    }

    let filtered = rowList.map((r) => ({
      ...r,
      profiles: profilesById.get(r.user_id) ?? null,
    }));
    if (data.q?.trim()) {
      const needle = data.q.toLowerCase();
      filtered = filtered.filter((r) => {
        const dn = (r.profiles?.display_name ?? "").toLowerCase();
        const ln = (r.profiles?.lmu_name ?? "").toLowerCase();
        return dn.includes(needle) || ln.includes(needle);
      });
    }
    if (data.status === "partial") {
      filtered = filtered.filter(
        (r) => r.refunded_amount_dkk && r.refunded_amount_dkk < r.amount_dkk,
      );
    }
    return { rows: filtered };
  });


/** Aggregate totals used at the top of the admin page. */
export const getPaymentsStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("donations")
      .select("amount_dkk, refunded_amount_dkk, source, donated_at, refunded_at");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let grossTotal = 0;
    let refundedTotal = 0;
    let netTotal = 0;
    let countAll = 0;
    let countRefunded = 0;
    let monthNet = 0;
    let donationsNet = 0;
    let coachingNet = 0;

    for (const r of rows) {
      const gross = r.amount_dkk ?? 0;
      const ref = r.refunded_amount_dkk ?? 0;
      const net = Math.max(gross - ref, 0);
      grossTotal += gross;
      refundedTotal += ref;
      netTotal += net;
      countAll += 1;
      if (r.refunded_at) countRefunded += 1;
      if (r.donated_at && new Date(r.donated_at) >= monthStart) monthNet += net;
      if (r.source === "coaching") coachingNet += net;
      else donationsNet += net;
    }

    return {
      grossTotal,
      refundedTotal,
      netTotal,
      countAll,
      countRefunded,
      monthNet,
      donationsNet,
      coachingNet,
    };
  });

const overviewSchema = z.object({
  environment: z.enum(["sandbox", "live"]),
});

/**
 * Read-only Stripe overview for admins: current balance (available/pending)
 * and recent payouts made from the Stripe dashboard. The website never moves
 * money — this is purely a status view.
 */
export const getStripeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => overviewSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const [balance, payouts] = await Promise.all([
        stripe.balance.retrieve(),
        stripe.payouts.list({ limit: 25 }),
      ]);

      const sumDkk = (list: { amount: number; currency: string }[]) =>
        list.filter((b) => b.currency === "dkk").reduce((s, b) => s + b.amount, 0) / 100;

      return {
        ok: true as const,
        availableDkk: sumDkk(balance.available as any),
        pendingDkk: sumDkk(balance.pending as any),
        payouts: payouts.data.map((p) => ({
          id: p.id,
          amountDkk: p.amount / 100,
          currency: p.currency,
          status: p.status, // paid | pending | in_transit | canceled | failed
          created: p.created,
          arrivalDate: p.arrival_date,
          method: p.method,
          description: p.description,
        })),
      };
    } catch (e) {
      return { ok: false as const, error: getStripeErrorMessage(e) };
    }
  });
