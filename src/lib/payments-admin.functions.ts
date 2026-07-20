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

const refundSchema = z.object({
  donationId: z.string().uuid(),
  amountDkk: z.number().int().positive().optional(),
  reason: z.enum(["requested_by_customer", "duplicate", "fraudulent"]).optional(),
  environment: z.enum(["sandbox", "live"]),
});

/**
 * Refund a payment. If the donation has a Stripe payment_intent_id we issue a
 * real Stripe refund; otherwise we mark it as manually refunded (for donations
 * that were registered by hand). Full refund by default; pass amountDkk for
 * partial refund. Refunded amount is subtracted from donor total via
 * recompute_donation_tier.
 */
export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => refundSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: donation, error } = await (supabaseAdmin as any)
      .from("donations")
      .select(
        "id, user_id, amount_dkk, refunded_amount_dkk, stripe_payment_intent_id, environment, source",
      )
      .eq("id", data.donationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!donation) return { error: "Betaling ikke fundet" };

    const alreadyRefunded = donation.refunded_amount_dkk ?? 0;
    const maxRefundable = donation.amount_dkk - alreadyRefunded;
    if (maxRefundable <= 0) return { error: "Beløbet er allerede refunderet fuldt ud" };
    const refundDkk = Math.min(data.amountDkk ?? maxRefundable, maxRefundable);

    let stripeRefundId: string | null = null;

    if (donation.stripe_payment_intent_id) {
      try {
        const env = (donation.environment as StripeEnv | null) ?? data.environment;
        const stripe = createStripeClient(env);
        const refund = await stripe.refunds.create({
          payment_intent: donation.stripe_payment_intent_id,
          amount: refundDkk * 100,
          reason: data.reason ?? "requested_by_customer",
        });
        stripeRefundId = refund.id;
      } catch (e) {
        return { error: getStripeErrorMessage(e) };
      }
    }

    const newRefunded = alreadyRefunded + refundDkk;
    const { error: updErr } = await (supabaseAdmin as any)
      .from("donations")
      .update({
        refunded_amount_dkk: newRefunded,
        refunded_at: new Date().toISOString(),
        stripe_refund_id: stripeRefundId ?? donation.stripe_payment_intent_id ? stripeRefundId : "manual",
      })
      .eq("id", data.donationId);
    if (updErr) return { error: updErr.message };

    // Recompute donor tier since refund reduces the counted amount.
    await (supabaseAdmin as any).rpc("recompute_donation_tier", { _user_id: donation.user_id });

    // Notify the donor.
    try {
      const { data: profile } = await (supabaseAdmin as any)
        .from("profiles")
        .select("display_name")
        .eq("id", donation.user_id)
        .maybeSingle();
      const name = (profile?.display_name as string | null)?.trim() || "ven";
      const title = "Din betaling er refunderet";
      const body =
        `Hej ${name}!\n\n` +
        `Vi har refunderet ${refundDkk} kr. af din betaling. Beløbet vil normalt være tilbage på din konto inden for få hverdage.\n\n` +
        `Er der noget, er du velkommen til at kontakte os.`;
      await (supabaseAdmin as any).from("notifications").insert({
        user_id: donation.user_id,
        title,
        body,
        link: "/donationer",
      });
    } catch (_) {}

    return { ok: true, refundDkk };
  });
