import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACC } from "./accounts";
import { isBalanced } from "./ledger";

type Ctx = { supabase: any; userId: string };

async function roles(ctx: Ctx): Promise<string[]> {
  const { data, error } = await ctx.supabase.rpc("fin_my_roles");
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}
async function requireFin(ctx: Ctx, adminOnly = false) {
  const r = await roles(ctx);
  const ok = adminOnly ? r.includes("finance_admin") : r.length > 0;
  if (!ok) throw new Error("Ingen økonomiadgang");
  return r;
}
async function myName(ctx: Ctx) {
  const { data } = await ctx.supabase.from("profiles").select("display_name").eq("id", ctx.userId).maybeSingle();
  return (data?.display_name as string) || "Ukendt";
}
function check<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const env = z.enum(["sandbox", "live"]);
const lineSchema = z.object({
  account: z.string().min(4).max(10),
  debit: z.number().int().min(0),
  credit: z.number().int().min(0),
  memo: z.string().max(300).optional(),
});

async function insertEntryWithLines(ctx: Ctx, entry: Record<string, unknown>, lines: z.infer<typeof lineSchema>[], post: boolean) {
  if (!isBalanced(lines)) throw new Error("Posten balancerer ikke");
  const e = check(await ctx.supabase.from("fin_journal_entries").insert({ ...entry, created_by: ctx.userId }).select("id").single()) as any;
  check(await ctx.supabase.from("fin_journal_lines").insert(lines.map((l, i) => ({
    entry_id: e.id, line_no: i + 1, account_code: l.account, debit_minor: l.debit, credit_minor: l.credit, memo: l.memo ?? null,
  }))));
  if (post) check(await ctx.supabase.rpc("fin_post_entry", { _entry_id: e.id }));
  return e.id as string;
}

// ---------- Access ----------
export const getFinanceMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ roles: await roles(context as Ctx) }));

export const listFinanceRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const rows = check(await ctx.supabase.from("fin_user_roles").select("id,user_id,role,created_at")) as any[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: profs } = ids.length ? await ctx.supabase.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
    const name = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
    return rows.map((r) => ({ ...r, name: name.get(r.user_id) ?? r.user_id }));
  });

export const setFinanceRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid(), role: z.enum(["finance_admin", "finance_approver"]), grant: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (data.grant) check(await ctx.supabase.from("fin_user_roles").insert({ user_id: data.userId, role: data.role, granted_by: ctx.userId }));
    else check(await ctx.supabase.from("fin_user_roles").delete().eq("user_id", data.userId).eq("role", data.role));
    return { ok: true };
  });

// ---------- Overview / tasks ----------
export const getFinanceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const r = await requireFin(ctx);
    const sb = ctx.supabase;
    const count = async (q: any) => (await q).count ?? 0;
    const [settings, rates, review, drafts, unmatched, dupes, syncErrors, pendingEvents, syncState, backups, openings, billsNoDoc, claimsPending, lines] = await Promise.all([
      sb.from("fin_settings").select("*").eq("id", 1).maybeSingle().then((x: any) => x.data),
      sb.from("fin_membership_rates").select("*").order("effective_from", { ascending: false }).then((x: any) => x.data ?? []),
      count(sb.from("fin_journal_entries").select("id", { count: "exact", head: true }).eq("needs_review", true).eq("status", "draft")),
      count(sb.from("fin_journal_entries").select("id", { count: "exact", head: true }).eq("status", "draft")),
      count(sb.from("fin_bank_transactions").select("id", { count: "exact", head: true }).eq("status", "unmatched")),
      count(sb.from("fin_bank_transactions").select("id", { count: "exact", head: true }).not("suspected_duplicate_of", "is", null).eq("status", "unmatched")),
      count(sb.from("fin_sync_errors").select("id", { count: "exact", head: true }).is("resolved_at", null)),
      count(sb.from("fin_stripe_events").select("event_id", { count: "exact", head: true }).is("processed_at", null)),
      sb.from("fin_stripe_sync_state").select("*").then((x: any) => x.data ?? []),
      sb.from("fin_backup_runs").select("*").order("started_at", { ascending: false }).limit(5).then((x: any) => x.data ?? []),
      sb.from("fin_journal_entries").select("id,description,status,proposal").eq("kind", "opening").then((x: any) => x.data ?? []),
      count(sb.from("fin_bills").select("id", { count: "exact", head: true }).eq("document_ids", "{}")),
      count(sb.from("fin_reimbursement_claims").select("id", { count: "exact", head: true }).eq("status", "submitted")),
      sb.from("fin_journal_lines").select("account_code,debit_minor,credit_minor,fin_journal_entries!inner(status)").eq("fin_journal_entries.status", "posted").then((x: any) => x.data ?? []),
    ]);
    const balances: Record<string, number> = {};
    for (const l of lines as any[]) balances[l.account_code] = (balances[l.account_code] ?? 0) + Number(l.debit_minor) - Number(l.credit_minor);
    return { roles: r, settings, rates, tasks: { review, drafts, unmatched, dupes, syncErrors, pendingEvents, billsNoDoc, claimsPending }, syncState, backups, openings, balances };
  });

// ---------- Settings ----------
export const updateFinanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    cutoff_at: z.string().datetime().nullable().optional(),
    vat_note: z.string().max(4000).nullable().optional(),
    treasurer_name: z.string().min(2).max(100).optional(),
    external_backup_destination: z.string().max(200).nullable().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    check(await ctx.supabase.from("fin_settings").update(data).eq("id", 1));
    return { ok: true };
  });

export const approveSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ what: z.enum(["cutoff", "rules", "vat", "auto_posting_on", "auto_posting_off"]), note: z.string().max(1000).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> =
      data.what === "cutoff" ? { cutoff_approved_at: now, cutoff_approved_by: ctx.userId }
      : data.what === "rules" ? { rules_approved_at: now, rules_approved_by: ctx.userId }
      : data.what === "vat" ? { vat_confirmed_at: now }
      : data.what === "auto_posting_on" ? { auto_posting_enabled: true }
      : { auto_posting_enabled: false };
    if (data.what === "cutoff") {
      const s = check(await ctx.supabase.from("fin_settings").select("cutoff_at").eq("id", 1).single()) as any;
      if (!s.cutoff_at) throw new Error("Angiv skæringspunktet først");
    }
    check(await ctx.supabase.from("fin_settings").update(patch).eq("id", 1));
    if (data.what === "cutoff" || data.what === "rules" || data.what === "auto_posting_on") {
      await ctx.supabase.from("fin_approvals").upsert({
        subject_type: data.what === "auto_posting_on" ? "auto_posting" : data.what, subject_id: now, approver_id: ctx.userId,
        approver_name: await myName(ctx), decision: "approved", note: data.note ?? null,
      });
    }
    return { ok: true };
  });

export const addMembershipRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ amount_minor: z.number().int().min(0), period_months: z.number().int().min(1).max(24), effective_from: z.string().date(), note: z.string().max(300).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    check(await ctx.supabase.from("fin_membership_rates").insert({ ...data, created_by: ctx.userId }));
    return { ok: true };
  });

// ---------- Accounts / journal ----------
export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    return check(await ctx.supabase.from("fin_accounts").select("*").order("code")) as any[];
  });

export const listJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    status: z.enum(["all", "draft", "posted", "review"]).default("all"),
    kind: z.string().max(30).optional(),
    account: z.string().max(10).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    limit: z.number().int().min(1).max(2000).default(300),
  }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    let q = ctx.supabase.from("fin_journal_entries").select("*, fin_journal_lines(*)").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(data.limit);
    if (data.status === "review") q = q.eq("needs_review", true).eq("status", "draft");
    else if (data.status !== "all") q = q.eq("status", data.status);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.from) q = q.gte("entry_date", data.from);
    if (data.to) q = q.lte("entry_date", data.to);
    let rows = check(await q) as any[];
    if (data.account) rows = rows.filter((r) => r.fin_journal_lines.some((l: any) => l.account_code === data.account));
    return rows;
  });

export const saveDraftEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    id: z.string().uuid().optional(),
    entry_date: z.string().date(),
    description: z.string().min(2).max(500),
    lines: z.array(lineSchema).min(2).max(50),
    document_ids: z.array(z.string().uuid()).max(50).default([]),
    clearReview: z.boolean().default(false),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    if (!isBalanced(data.lines)) throw new Error("Posten balancerer ikke");
    if (data.id) {
      const patch: any = { entry_date: data.entry_date, description: data.description, document_ids: data.document_ids };
      if (data.clearReview) { patch.needs_review = false; patch.review_reason = null; patch.rule_explanation = "Manuelt kontrolleret af kasserer"; }
      check(await ctx.supabase.from("fin_journal_entries").update(patch).eq("id", data.id).eq("status", "draft"));
      check(await ctx.supabase.from("fin_journal_lines").delete().eq("entry_id", data.id));
      check(await ctx.supabase.from("fin_journal_lines").insert(data.lines.map((l, i) => ({ entry_id: data.id, line_no: i + 1, account_code: l.account, debit_minor: l.debit, credit_minor: l.credit, memo: l.memo ?? null }))));
      return { id: data.id };
    }
    const id = await insertEntryWithLines(ctx, { entry_date: data.entry_date, description: data.description, kind: "normal", document_ids: data.document_ids }, data.lines, false);
    return { id };
  });

export const postEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    check(await ctx.supabase.rpc("fin_post_entry", { _entry_id: data.id }));
    return { ok: true };
  });

export const reverseEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), reason: z.string().min(3).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    return { id: check(await ctx.supabase.rpc("fin_reverse_entry", { _entry_id: data.id, _reason: data.reason })) };
  });

export const deleteDraftEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const e = check(await ctx.supabase.from("fin_journal_entries").select("kind,source_type").eq("id", data.id).single()) as any;
    if (e.kind === "opening") throw new Error("Åbningskladder kan ikke slettes");
    if (e.source_type === "stripe_bt") throw new Error("Stripe-kladder slettes ikke – de genoprettes ved næste synkronisering. Ret dem i stedet.");
    check(await ctx.supabase.from("fin_journal_entries").delete().eq("id", data.id).eq("status", "draft"));
    return { ok: true };
  });

// ---------- Opening entries ----------
export const saveOpeningProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    id: z.string().uuid(),
    amount_minor: z.number().int().positive(),
    lines: z.array(lineSchema).min(2).max(20),
    location_note: z.string().max(2000).optional(),
    documentation_note: z.string().max(2000).min(5),
    document_ids: z.array(z.string().uuid()).max(100).default([]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    if (!isBalanced(data.lines)) throw new Error("Posten balancerer ikke");
    const e = check(await ctx.supabase.from("fin_journal_entries").select("*").eq("id", data.id).single()) as any;
    if (e.kind !== "opening" || e.status !== "draft") throw new Error("Ikke en åben åbningskladde");
    const p = e.proposal ?? {};
    const total = data.lines.reduce((s, l) => s + l.debit, 0);
    if (total !== data.amount_minor) throw new Error("Linjernes sum skal svare til beløbet");
    if (p.type === "opening_reimbursement") {
      const debt = data.lines.filter((l) => l.account === ACC.reimbursementDebt).reduce((s, l) => s + l.credit - l.debit, 0);
      if (debt !== data.amount_minor) throw new Error("Hele beløbet skal krediteres Gæld til udlægshavere");
      if (data.lines.some((l) => l.account.startsWith("6") && l.debit > 0)) throw new Error("Udlægsopgørelsen må ikke bogføres som nye driftsudgifter");
    }
    // Any change invalidates earlier approvals
    await ctx.supabase.from("fin_approvals").delete().eq("subject_type", "opening_entry").eq("subject_id", data.id);
    check(await ctx.supabase.from("fin_journal_entries").update({
      proposal: { ...p, amount_minor: data.amount_minor, location_note: data.location_note ?? null, documentation_note: data.documentation_note, preliminary: false },
      document_ids: data.document_ids,
    }).eq("id", data.id));
    check(await ctx.supabase.from("fin_journal_lines").delete().eq("entry_id", data.id));
    check(await ctx.supabase.from("fin_journal_lines").insert(data.lines.map((l, i) => ({ entry_id: data.id, line_no: i + 1, account_code: l.account, debit_minor: l.debit, credit_minor: l.credit, memo: l.memo ?? null }))));
    return { ok: true };
  });

export const recordApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    subject_type: z.enum(["opening_entry", "claim", "period_board", "period_general_assembly"]),
    subject_id: z.string().min(1).max(100),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().max(2000).optional(),
    meeting_date: z.string().date().optional(),
    document_id: z.string().uuid().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    if (data.subject_type === "period_general_assembly" && (!data.meeting_date || !data.document_id)) {
      throw new Error("Generalforsamlingens godkendelse kræver dato og referat som bilag");
    }
    check(await ctx.supabase.from("fin_approvals").insert({ ...data, approver_id: ctx.userId, approver_name: await myName(ctx) }));
    if (data.subject_type === "claim") {
      const status = data.decision === "approved" ? "approved" : "rejected";
      const { error } = await ctx.supabase.from("fin_reimbursement_claims").update({ status }).eq("id", data.subject_id).eq("status", "submitted");
      if (error) throw new Error(error.message);
      if (status === "approved") await bookApprovedClaim(ctx, data.subject_id);
    }
    if (data.subject_type === "period_board" || data.subject_type === "period_general_assembly") {
      if (data.decision === "approved") {
        await ctx.supabase.from("fin_periods").update({ approval_stage: data.subject_type === "period_board" ? "board_approved" : "general_assembly_approved" }).eq("id", data.subject_id);
      }
    }
    return { ok: true };
  });

export const listApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ subject_type: z.string().max(40).optional(), subject_id: z.string().max(100).optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    let q = ctx.supabase.from("fin_approvals").select("*").order("created_at", { ascending: false }).limit(500);
    if (data.subject_type) q = q.eq("subject_type", data.subject_type);
    if (data.subject_id) q = q.eq("subject_id", data.subject_id);
    return check(await q) as any[];
  });

// ---------- Claims / repayments ----------
async function bookApprovedClaim(ctx: Ctx, claimId: string) {
  const c = check(await ctx.supabase.from("fin_reimbursement_claims").select("*").eq("id", claimId).single()) as any;
  if (c.is_opening || c.journal_entry_id || !c.expense_account_code) return;
  // Draft only; the treasurer posts it (keeps human control while auto posting is off).
  const id = await insertEntryWithLines(ctx, {
    entry_date: c.expense_date ?? new Date().toISOString().slice(0, 10), description: `Udlæg: ${c.title} (${c.claimant_name})`, kind: "reimbursement", document_ids: c.document_ids,
  }, [
    { account: c.expense_account_code, debit: Number(c.amount_minor), credit: 0 },
    { account: ACC.reimbursementDebt, debit: 0, credit: Number(c.amount_minor) },
  ], false);
  await ctx.supabase.from("fin_reimbursement_claims").update({ journal_entry_id: id }).eq("id", claimId);
}

export const submitClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    title: z.string().min(2).max(300), expense_date: z.string().date(), amount_minor: z.number().int().positive(),
    expense_account_code: z.string().min(4).max(10), document_ids: z.array(z.string().uuid()).min(1).max(30),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    check(await ctx.supabase.from("fin_reimbursement_claims").insert({ ...data, claimant_id: ctx.userId, claimant_name: await myName(ctx), status: "submitted" }));
    return { ok: true };
  });

export const listClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    const [claims, reps, settings, openings] = await Promise.all([
      ctx.supabase.from("fin_reimbursement_claims").select("*").order("created_at", { ascending: false }).then((x: any) => x.data ?? []),
      ctx.supabase.from("fin_repayments").select("*").order("paid_on", { ascending: false }).then((x: any) => x.data ?? []),
      ctx.supabase.from("fin_settings").select("cutoff_at").eq("id", 1).maybeSingle().then((x: any) => x.data),
      ctx.supabase.from("fin_journal_entries").select("id,status,proposal,fin_journal_lines(account_code,credit_minor,debit_minor)").eq("kind", "opening").then((x: any) => x.data ?? []),
    ]);
    // Balance of account 2100 from posted entries = actual debt
    const lines = check(await ctx.supabase.from("fin_journal_lines").select("debit_minor,credit_minor,fin_journal_entries!inner(status)").eq("account_code", ACC.reimbursementDebt).eq("fin_journal_entries.status", "posted")) as any[];
    const bookedDebt = lines.reduce((s, l) => s + Number(l.credit_minor) - Number(l.debit_minor), 0);
    return { claims, repayments: reps, cutoff: settings?.cutoff_at ?? null, openings, bookedDebt };
  });

export const recordRepayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    claimant_id: z.string().uuid(), amount_minor: z.number().int().positive(), paid_on: z.string().date(),
    bank_transaction_id: z.string().uuid(), note: z.string().max(500).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const s = check(await ctx.supabase.from("fin_settings").select("cutoff_at").eq("id", 1).single()) as any;
    if (!s.cutoff_at || data.paid_on < String(s.cutoff_at).slice(0, 10)) throw new Error("Kun bekræftede tilbagebetalinger efter skæringspunktet nedskriver gælden");
    const bt = check(await ctx.supabase.from("fin_bank_transactions").select("*").eq("id", data.bank_transaction_id).single()) as any;
    if (bt.status !== "unmatched") throw new Error("Bankposteringen er allerede matchet");
    if (Number(bt.amount_minor) !== -data.amount_minor) throw new Error("Beløbet skal svare til bankposteringen (udbetaling)");
    const debtLines = check(await ctx.supabase.from("fin_journal_lines").select("debit_minor,credit_minor,fin_journal_entries!inner(status)").eq("account_code", ACC.reimbursementDebt).eq("fin_journal_entries.status", "posted")) as any[];
    const debt = debtLines.reduce((acc, l) => acc + Number(l.credit_minor) - Number(l.debit_minor), 0);
    if (data.amount_minor > debt) throw new Error("Tilbagebetalingen er større end den bogførte restgæld");
    const acct = check(await ctx.supabase.from("fin_bank_accounts").select("account_code").eq("id", bt.bank_account_id).single()) as any;
    const entryId = await insertEntryWithLines(ctx, { entry_date: data.paid_on, description: `Tilbagebetaling af udlæg${data.note ? `: ${data.note}` : ""}`, kind: "repayment" }, [
      { account: ACC.reimbursementDebt, debit: data.amount_minor, credit: 0 },
      { account: acct.account_code, debit: 0, credit: data.amount_minor },
    ], true);
    check(await ctx.supabase.from("fin_repayments").insert({ ...data, journal_entry_id: entryId, created_by: ctx.userId }));
    check(await ctx.supabase.from("fin_bank_transactions").update({ status: "matched", journal_entry_id: entryId }).eq("id", bt.id));
    return { ok: true };
  });

// ---------- Rules ----------
export const listRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    return check(await ctx.supabase.from("fin_category_rules").select("*").order("priority")) as any[];
  });

export const saveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    id: z.string().uuid().optional(), name: z.string().min(2).max(200), priority: z.number().int().min(0).max(10000),
    match_type: z.enum(["product_id", "price_id", "lookup_key", "metadata"]), match_key: z.string().max(100).nullable().optional(),
    match_value: z.string().min(1).max(200), category: z.enum(["membership", "donation", "sponsorship", "coaching", "other_income"]),
    account_code: z.string().min(4).max(10), environment: z.enum(["sandbox", "live"]).nullable().optional(), active: z.boolean(), note: z.string().max(500).nullable().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const { id, ...rest } = data;
    if (id) check(await ctx.supabase.from("fin_category_rules").update(rest).eq("id", id));
    else check(await ctx.supabase.from("fin_category_rules").insert({ ...rest, created_by: ctx.userId }));
    // Rule changes require renewed approval
    await ctx.supabase.from("fin_settings").update({ rules_approved_at: null, rules_approved_by: null, auto_posting_enabled: false }).eq("id", 1);
    return { ok: true };
  });

export const deleteRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    check(await ctx.supabase.from("fin_category_rules").delete().eq("id", data.id));
    await ctx.supabase.from("fin_settings").update({ rules_approved_at: null, rules_approved_by: null, auto_posting_enabled: false }).eq("id", 1);
    return { ok: true };
  });

// ---------- Stripe ----------
export const runStripeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ env, action: z.enum(["access", "history", "recent", "inbox", "unresolved", "balance"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const m = await import("./stripe-sync.server");
    const { getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      switch (data.action) {
        case "access": return { result: await m.checkStripeAccess(data.env) };
        case "history": return { result: await m.syncBalanceTransactions(data.env, "history", 5) };
        case "recent": return { result: await m.syncBalanceTransactions(data.env, "recent", 10) };
        case "inbox": return { result: await m.processEventInbox(data.env) };
        case "unresolved": return { result: await m.followUnresolved(data.env) };
        case "balance": {
          const b = await m.getStripeBalance(data.env);
          return { result: { available: b.available, pending: b.pending, connect_reserved: b.connect_reserved ?? [], instant_available: b.instant_available ?? [] } };
        }
      }
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

export const getStripeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ env }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    const sb = ctx.supabase;
    const [state, access, errors, events, objects, unresolved] = await Promise.all([
      sb.from("fin_stripe_sync_state").select("*").eq("environment", data.env).then((x: any) => x.data ?? []),
      sb.from("fin_stripe_access_checks").select("*").eq("environment", data.env).order("checked_at", { ascending: false }).limit(1).then((x: any) => x.data?.[0] ?? null),
      sb.from("fin_sync_errors").select("*").eq("environment", data.env).is("resolved_at", null).order("created_at", { ascending: false }).limit(50).then((x: any) => x.data ?? []),
      sb.from("fin_stripe_events").select("event_id,type,received_at,processed_at,attempts,last_error").eq("environment", data.env).order("received_at", { ascending: false }).limit(30).then((x: any) => x.data ?? []),
      sb.from("fin_stripe_objects").select("object_type,stripe_id,status,amount_minor,currency,stripe_created_at,is_historical,unresolved,data->reporting_category").eq("environment", data.env).eq("object_type", "balance_transaction").order("stripe_created_at", { ascending: false }).limit(200).then((x: any) => x.data ?? []),
      sb.from("fin_stripe_objects").select("object_type,stripe_id,status", { count: "exact" }).eq("environment", data.env).eq("unresolved", true).limit(50).then((x: any) => x.data ?? []),
    ]);
    const { data: posted } = await sb.from("fin_journal_entries").select("source_key,status,needs_review,review_reason,rule_explanation,id").eq("source_type", "stripe_bt").eq("environment", data.env).limit(2000);
    const byKey = new Map((posted ?? []).map((p: any) => [p.source_key, p]));
    return {
      state, access, errors, events, unresolved,
      transactions: objects.map((o: any) => ({ ...o, entry: byKey.get(o.stripe_id) ?? null })),
      configured: true,
    };
  });

export const resolveSyncError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    check(await ctx.supabase.from("fin_sync_errors").update({ resolved_at: new Date().toISOString() }).eq("id", data.id));
    return { ok: true };
  });

// ---------- Periods ----------
export const listPeriods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    return check(await ctx.supabase.from("fin_periods").select("*").order("period_start", { ascending: false })) as any[];
  });

export const upsertPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ kind: z.enum(["month", "year"]), period_start: z.string().date() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const s = new Date(data.period_start + "T00:00:00Z");
    const e = data.kind === "month" ? new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0)) : new Date(Date.UTC(s.getUTCFullYear(), 11, 31));
    check(await ctx.supabase.from("fin_periods").upsert({ kind: data.kind, period_start: data.period_start, period_end: e.toISOString().slice(0, 10) }, { onConflict: "kind,period_start", ignoreDuplicates: true }));
    return { ok: true };
  });

export const setPeriodLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), lock: z.boolean(), reason: z.string().max(1000).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    if (!data.lock && (!data.reason || data.reason.trim().length < 5)) throw new Error("Genåbning kræver en begrundelse");
    if (data.lock) {
      const p = check(await ctx.supabase.from("fin_periods").select("*").eq("id", data.id).single()) as any;
      const { count } = await ctx.supabase.from("fin_journal_entries").select("id", { count: "exact", head: true }).eq("status", "draft").gte("entry_date", p.period_start).lte("entry_date", p.period_end);
      if ((count ?? 0) > 0) throw new Error(`Perioden har ${count} kladder, der skal bogføres eller flyttes først`);
    }
    check(await ctx.supabase.from("fin_periods").update(data.lock ? { status: "locked" } : { status: "open", reopen_reason: data.reason, approval_stage: "draft" }).eq("id", data.id));
    return { ok: true };
  });

// ---------- Audit ----------
export const listFinanceAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    const rows = check(await ctx.supabase.from("fin_audit_log").select("id,actor_id,actor_label,action,subject_type,subject_id,created_at").order("created_at", { ascending: false }).limit(500)) as any[];
    const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
    const { data: profs } = ids.length ? await ctx.supabase.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
    const name = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
    return rows.map((r) => ({ ...r, actor: r.actor_id ? name.get(r.actor_id) ?? r.actor_id : r.actor_label ?? "system" }));
  });
