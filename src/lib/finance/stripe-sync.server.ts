import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";
import { categorize, type CategoryRule, type PaymentContext } from "./categorize";
import { decidePosting, type BalanceTx } from "./stripe-posting";

const ACCOUNT = "default";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function logError(env: StripeEnv, context: string, e: unknown) {
  const sb = await admin();
  const message = getStripeErrorMessage(e).slice(0, 1000);
  console.error(`[finance-sync] ${context}: ${message}`);
  await sb.from("fin_sync_errors").insert({ environment: env, context, message });
}

function isUnresolved(type: string, o: any): boolean {
  switch (type) {
    case "balance_transaction": return o.status === "pending";
    case "charge": return o.status === "pending";
    case "refund": return o.status === "pending" || o.status === "requires_action";
    case "payout": return ["pending", "in_transit"].includes(o.status);
    case "dispute": return !["won", "lost", "warning_closed"].includes(o.status);
    default: return false;
  }
}

async function storeObject(env: StripeEnv, type: string, o: any, cutoff: Date | null, sourceId?: string | null) {
  const sb = await admin();
  const created = o.created ? new Date(o.created * 1000) : null;
  await sb.from("fin_stripe_objects").upsert(
    {
      environment: env,
      stripe_account_id: ACCOUNT,
      object_type: type,
      stripe_id: o.id,
      status: o.status ?? null,
      amount_minor: typeof o.amount === "number" ? o.amount : null,
      currency: o.currency ?? null,
      stripe_created_at: created?.toISOString() ?? null,
      source_id: sourceId ?? null,
      data: o,
      is_historical: !!(cutoff && created && created < cutoff),
      unresolved: isUnresolved(type, o),
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "environment,stripe_account_id,stripe_id" },
  );
}

async function loadConfig() {
  const sb = await admin();
  const [{ data: s }, { data: rules }] = await Promise.all([
    sb.from("fin_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("fin_category_rules").select("*"),
  ]);
  const cutoffAt = s?.cutoff_at && s?.cutoff_approved_at ? new Date(s.cutoff_at) : null;
  return { settings: s, rules: (rules ?? []) as CategoryRule[], cutoffAt };
}

/** Collect documented identifiers (metadata, price, product, lookup key) for the charge behind a BT. */
async function paymentContext(stripe: ReturnType<typeof createStripeClient>, env: StripeEnv, chargeId: string): Promise<PaymentContext> {
  const ctx: PaymentContext = { environment: env, productIds: [], priceIds: [], lookupKeys: [], metadata: {} };
  const charge: any = await stripe.charges.retrieve(chargeId, { expand: ["payment_intent", "invoice"] } as any);
  Object.assign(ctx.metadata, charge.metadata ?? {});
  const pi = charge.payment_intent && typeof charge.payment_intent === "object" ? charge.payment_intent : null;
  if (pi) Object.assign(ctx.metadata, pi.metadata ?? {});
  const piId = pi?.id ?? (typeof charge.payment_intent === "string" ? charge.payment_intent : null);
  if (piId) {
    try {
      const sessions = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1, expand: ["data.line_items"] } as any);
      const s: any = sessions.data[0];
      if (s) {
        Object.assign(ctx.metadata, s.metadata ?? {});
        await storeObject(env, "checkout_session", s, null, charge.id);
        for (const li of s.line_items?.data ?? []) {
          if (li.price?.id) ctx.priceIds.push(li.price.id);
          if (li.price?.lookup_key) ctx.lookupKeys.push(li.price.lookup_key);
          const prod = typeof li.price?.product === "string" ? li.price.product : li.price?.product?.id;
          if (prod) ctx.productIds.push(prod);
        }
      }
    } catch (e) {
      await logError(env, `checkout session for ${piId}`, e);
    }
  }
  const inv = charge.invoice && typeof charge.invoice === "object" ? charge.invoice : null;
  if (inv) {
    await storeObject(env, "invoice", inv, null, charge.id);
    Object.assign(ctx.metadata, inv.metadata ?? {});
    for (const l of inv.lines?.data ?? []) {
      const p = l.price ?? l.pricing?.price_details;
      if (p?.id) ctx.priceIds.push(p.id);
      if (p?.lookup_key) ctx.lookupKeys.push(p.lookup_key);
      if (typeof p?.product === "string") ctx.productIds.push(p.product);
    }
  }
  await storeObject(env, "charge", charge, null, null);
  if (pi) await storeObject(env, "payment_intent", pi, null, charge.id);
  return ctx;
}

function chargeIdFromSource(src: any): string | null {
  if (!src) return null;
  if (typeof src === "string") return src.startsWith("ch_") || src.startsWith("py_") ? src : null;
  if (src.object === "charge") return src.id;
  if (src.object === "refund" || src.object === "dispute") return typeof src.charge === "string" ? src.charge : src.charge?.id ?? null;
  return null;
}

export async function processBalanceTransaction(env: StripeEnv, bt: any, cfg?: Awaited<ReturnType<typeof loadConfig>>) {
  const stripe = createStripeClient(env);
  const c = cfg ?? (await loadConfig());
  const sb = await admin();
  const src = bt.source;
  if (src && typeof src === "object") await storeObject(env, src.object, src, c.cutoffAt, null);
  await storeObject(env, "balance_transaction", bt, c.cutoffAt, typeof src === "string" ? src : src?.id);

  const t: BalanceTx = {
    id: bt.id, amount: bt.amount, fee: bt.fee, net: bt.net, currency: bt.currency, created: bt.created,
    type: bt.type, reporting_category: bt.reporting_category, source: typeof src === "string" ? src : src?.id ?? null, status: bt.status,
  };
  const historical = !!(c.cutoffAt && t.created * 1000 < c.cutoffAt.getTime());
  let category = null;
  const needsCat = ["charge", "refund", "refund_failure", "dispute", "dispute_reversal", "charge_failure", "partial_capture_reversal"].includes(t.reporting_category);
  if (!historical && needsCat) {
    const chargeId = chargeIdFromSource(src);
    if (chargeId) {
      try {
        category = categorize(c.rules, await paymentContext(stripe, env, chargeId));
      } catch (e) {
        await logError(env, `kontekst for ${bt.id}`, e);
        category = { status: "review" as const, reason: "Kunne ikke hente betalingens oplysninger fra Stripe" };
      }
    } else category = { status: "review" as const, reason: "Kildeobjekt uden tilknyttet betaling" };
  }
  const d = decidePosting(t, { cutoffAt: c.cutoffAt, category });
  if (d.kind === "historical") return { result: "historical" };
  const date = new Date(t.created * 1000).toISOString().slice(0, 10);
  const rule = category && category.status === "matched" ? category.rule : null;
  const { data, error } = await sb.rpc("fin_record_stripe_posting", {
    _env: env,
    _account: ACCOUNT,
    _bt_id: t.id,
    _date: date,
    _description: d.kind === "post" ? d.description : `Stripe ${t.reporting_category} ${t.id}`,
    _lines: d.kind === "post" ? d.lines : [],
    _decision: d.kind === "post" ? "post" : "review",
    _reason: d.kind === "review" ? d.reason : null,
    _explanation: d.kind === "post" ? d.explanation : null,
    _rule_id: rule?.id ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Resumable import. mode=history walks everything; mode=recent covers the last 35 days. */
export async function syncBalanceTransactions(env: StripeEnv, mode: "history" | "recent", maxPages = 10) {
  const sb = await admin();
  const stripe = createStripeClient(env);
  const cfg = await loadConfig();
  const stateKey = mode === "history" ? "balance_transaction_history" : "balance_transaction_recent";
  const { data: st } = await sb.from("fin_stripe_sync_state").select("*").eq("environment", env).eq("object_type", stateKey).maybeSingle();
  let cursor: string | null = mode === "history" && st && !st.completed ? st.cursor : null;
  if (mode === "history" && st?.completed) return { processed: 0, done: true, note: "Historik er allerede importeret" };
  let processed = 0;
  let done = false;
  const counts: Record<string, number> = {};
  await sb.from("fin_stripe_sync_state").upsert({ environment: env, object_type: stateKey, last_run_at: new Date().toISOString() });
  try {
    for (let p = 0; p < maxPages; p++) {
      const params: any = { limit: 100, expand: ["data.source"] };
      if (cursor) params.starting_after = cursor;
      if (mode === "recent") params.created = { gte: Math.floor(Date.now() / 1000) - 35 * 86400 };
      const page = await stripe.balanceTransactions.list(params);
      for (const bt of page.data) {
        try {
          const r: any = await processBalanceTransaction(env, bt, cfg);
          counts[r?.result ?? "?"] = (counts[r?.result ?? "?"] ?? 0) + 1;
        } catch (e) {
          await logError(env, `bogføring af ${bt.id}`, e);
        }
        processed++;
        cursor = bt.id;
      }
      if (mode === "history") await sb.from("fin_stripe_sync_state").update({ cursor }).eq("environment", env).eq("object_type", stateKey);
      if (!page.has_more) { done = true; break; }
    }
    await sb.from("fin_stripe_sync_state").update({
      completed: mode === "history" ? done : false, last_success_at: new Date().toISOString(), last_error: null,
    }).eq("environment", env).eq("object_type", stateKey);
  } catch (e) {
    await logError(env, `import (${mode})`, e);
    await sb.from("fin_stripe_sync_state").update({ last_error: getStripeErrorMessage(e).slice(0, 500) }).eq("environment", env).eq("object_type", stateKey);
    throw e;
  }
  return { processed, done, counts };
}

/** Re-fetch every unresolved object regardless of age (pending charges, open disputes, pending refunds, payouts in transit). */
export async function followUnresolved(env: StripeEnv) {
  const sb = await admin();
  const stripe = createStripeClient(env);
  const { data: rows } = await sb.from("fin_stripe_objects").select("object_type, stripe_id").eq("environment", env).eq("unresolved", true).limit(200);
  let updated = 0;
  for (const r of rows ?? []) {
    try {
      let o: any;
      if (r.object_type === "charge") o = await stripe.charges.retrieve(r.stripe_id);
      else if (r.object_type === "refund") o = await stripe.refunds.retrieve(r.stripe_id);
      else if (r.object_type === "payout") o = await stripe.payouts.retrieve(r.stripe_id);
      else if (r.object_type === "dispute") o = await stripe.disputes.retrieve(r.stripe_id);
      else if (r.object_type === "balance_transaction") o = await stripe.balanceTransactions.retrieve(r.stripe_id);
      else continue;
      await storeObject(env, r.object_type, o, null);
      // Any new balance transactions tied to these objects (e.g. dispute fees, failed payouts)
      const btIds: string[] = [];
      if (o.balance_transaction) btIds.push(typeof o.balance_transaction === "string" ? o.balance_transaction : o.balance_transaction.id);
      if (o.failure_balance_transaction) btIds.push(typeof o.failure_balance_transaction === "string" ? o.failure_balance_transaction : o.failure_balance_transaction.id);
      for (const b of o.balance_transactions ?? []) btIds.push(typeof b === "string" ? b : b.id);
      for (const id of btIds) {
        const bt = await stripe.balanceTransactions.retrieve(id, { expand: ["source"] } as any);
        await processBalanceTransaction(env, bt);
      }
      updated++;
    } catch (e) {
      await logError(env, `opfølgning ${r.stripe_id}`, e);
    }
  }
  return { checked: rows?.length ?? 0, updated };
}

/** Process webhook events stored in the inbox. Objects are fetched fresh so order/delay doesn't matter. */
export async function processEventInbox(env: StripeEnv, limit = 50) {
  const sb = await admin();
  const stripe = createStripeClient(env);
  const { data: events } = await sb.from("fin_stripe_events").select("*").eq("environment", env).is("processed_at", null).lt("attempts", 10).order("received_at").limit(limit);
  let ok = 0;
  for (const ev of events ?? []) {
    try {
      const btIds = new Set<string>();
      const id: string = ev.object_id ?? "";
      let o: any = null;
      if (id.startsWith("ch_") || id.startsWith("py_")) o = await stripe.charges.retrieve(id);
      else if (id.startsWith("re_") || id.startsWith("pyr_")) o = await stripe.refunds.retrieve(id);
      else if (id.startsWith("po_")) o = await stripe.payouts.retrieve(id);
      else if (id.startsWith("dp_") || id.startsWith("du_")) o = await stripe.disputes.retrieve(id);
      else if (id.startsWith("txn_")) btIds.add(id);
      if (o) {
        await storeObject(env, o.object, o, null);
        if (o.balance_transaction) btIds.add(typeof o.balance_transaction === "string" ? o.balance_transaction : o.balance_transaction.id);
        if (o.failure_balance_transaction) btIds.add(typeof o.failure_balance_transaction === "string" ? o.failure_balance_transaction : o.failure_balance_transaction.id);
        for (const b of o.balance_transactions ?? []) btIds.add(typeof b === "string" ? b : b.id);
      }
      for (const b of btIds) {
        const bt = await stripe.balanceTransactions.retrieve(b, { expand: ["source"] } as any);
        await processBalanceTransaction(env, bt);
      }
      await sb.from("fin_stripe_events").update({ processed_at: new Date().toISOString(), attempts: ev.attempts + 1, last_error: null }).eq("event_id", ev.event_id);
      ok++;
    } catch (e) {
      await sb.from("fin_stripe_events").update({ attempts: ev.attempts + 1, last_error: getStripeErrorMessage(e).slice(0, 500) }).eq("event_id", ev.event_id);
      await logError(env, `event ${ev.event_id}`, e);
    }
  }
  return { processed: ok, pending: (events?.length ?? 0) - ok };
}

/** Store an incoming (already signature-verified) webhook event. Duplicate event IDs are ignored. */
export async function enqueueFinanceEvent(event: any, env: StripeEnv) {
  const relevant = /^(charge\.|payout\.|refund\.|charge\.dispute\.|balance\.)/.test(event?.type ?? "");
  if (!relevant || !event?.id) return;
  const sb = await admin();
  await sb.from("fin_stripe_events").upsert(
    { event_id: event.id, environment: env, type: event.type, object_id: event.data?.object?.id ?? null },
    { onConflict: "event_id", ignoreDuplicates: true },
  );
}

export async function checkStripeAccess(env: StripeEnv) {
  const stripe = createStripeClient(env);
  const checks: [string, () => Promise<unknown>][] = [
    ["Saldo (balance)", () => stripe.balance.retrieve()],
    ["Balance transactions", () => stripe.balanceTransactions.list({ limit: 1 })],
    ["Charges", () => stripe.charges.list({ limit: 1 })],
    ["Refunds", () => stripe.refunds.list({ limit: 1 })],
    ["Disputes", () => stripe.disputes.list({ limit: 1 })],
    ["Payouts", () => stripe.payouts.list({ limit: 1 })],
    ["Invoices", () => stripe.invoices.list({ limit: 1 })],
    ["Checkout sessions", () => stripe.checkout.sessions.list({ limit: 1 })],
  ];
  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const [name, fn] of checks) {
    try { await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: getStripeErrorMessage(e) }); }
  }
  const sb = await admin();
  await sb.from("fin_stripe_access_checks").insert({ environment: env, results });
  return results;
}

export async function getStripeBalance(env: StripeEnv) {
  const stripe = createStripeClient(env);
  return (await stripe.balance.retrieve()) as any;
}

export async function dailyFinanceSync(env: StripeEnv) {
  const out: Record<string, unknown> = {};
  out.inbox = await processEventInbox(env).catch((e) => ({ error: getStripeErrorMessage(e) }));
  out.recent = await syncBalanceTransactions(env, "recent", 20).catch((e) => ({ error: getStripeErrorMessage(e) }));
  out.unresolved = await followUnresolved(env).catch((e) => ({ error: getStripeErrorMessage(e) }));
  return out;
}
