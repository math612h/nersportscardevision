import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACC } from "./accounts";

type Ctx = { supabase: any; userId: string };
function check<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
async function requireFin(ctx: Ctx, adminOnly = false) {
  const { data } = await ctx.supabase.rpc("fin_my_roles");
  const r = (data ?? []) as string[];
  if (adminOnly ? !r.includes("finance_admin") : r.length === 0) throw new Error("Ingen økonomiadgang");
}
async function postNew(ctx: Ctx, entry: Record<string, unknown>, lines: { account: string; debit: number; credit: number; memo?: string }[], post = true) {
  const e = check(await ctx.supabase.from("fin_journal_entries").insert({ ...entry, created_by: ctx.userId }).select("id").single()) as any;
  check(await ctx.supabase.from("fin_journal_lines").insert(lines.map((l, i) => ({ entry_id: e.id, line_no: i + 1, account_code: l.account, debit_minor: l.debit, credit_minor: l.credit, memo: l.memo ?? null }))));
  if (post) check(await ctx.supabase.rpc("fin_post_entry", { _entry_id: e.id }));
  return e.id as string;
}

// ---------- Documents ----------
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "text/csv"];
export const uploadFinanceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    filename: z.string().min(1).max(200), mime_type: z.string().max(100), base64: z.string().max(28_000_000),
    kind: z.enum(["receipt", "invoice", "statement", "reimbursement_statement", "minutes", "other"]), description: z.string().max(500).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    if (!ALLOWED.includes(data.mime_type)) throw new Error("Kun PDF, billeder og CSV");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Maks 20 MB");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const path = `docs/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safe}`;
    const up = await ctx.supabase.storage.from("accounting-docs").upload(path, bytes, { contentType: data.mime_type, upsert: false });
    if (up.error) throw new Error(up.error.message);
    const doc = check(await ctx.supabase.from("fin_documents").insert({
      storage_path: path, filename: data.filename, mime_type: data.mime_type, size_bytes: bytes.byteLength, sha256: hash,
      kind: data.kind, description: data.description ?? null, uploaded_by: ctx.userId,
    }).select("*").single());
    return doc as any;
  });

export const listFinanceDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    return check(await ctx.supabase.from("fin_documents").select("*").order("created_at", { ascending: false }).limit(1000)) as any[];
  });

export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    const d = check(await ctx.supabase.from("fin_documents").select("storage_path").eq("id", data.id).single()) as any;
    const s = await ctx.supabase.storage.from("accounting-docs").createSignedUrl(d.storage_path, 300);
    if (s.error) throw new Error(s.error.message);
    return { url: s.data.signedUrl as string };
  });

/** AI proposal from a receipt: fields it cannot read stay null; confidence shown; nothing saved automatically. */
export const extractDocumentWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const d = check(await ctx.supabase.from("fin_documents").select("*").eq("id", data.id).single()) as any;
    if (!d.mime_type.startsWith("image/") && d.mime_type !== "application/pdf") return { error: "Kun billeder og PDF kan læses" };
    const file = await ctx.supabase.storage.from("accounting-docs").download(d.storage_path);
    if (file.error) return { error: file.error.message };
    const buf = new Uint8Array(await file.data.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const dataUrl = `data:${d.mime_type};base64,${btoa(bin)}`;
    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    let parsed: any = null;
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions: "Du udtrækker felter fra en kvittering/faktura. Opfind aldrig værdier. Hvis et felt ikke tydeligt fremgår, sæt det til null. Angiv confidence 0-1 pr. felt og citér den tekst feltet er læst fra. Svar kun med JSON: {supplier, invoice_date, total, currency, vat_amount, category_suggestion, confidence:{...}, sources:{...}}.",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "Udtræk leverandør, fakturadato (YYYY-MM-DD), totalbeløb inkl. moms, valuta, momsbeløb og et forslag til kategori (website, software, trophies, marketing, fees, other)." },
            d.mime_type === "application/pdf"
              ? { type: "input_file", filename: d.filename, file_data: dataUrl }
              : { type: "input_image", image_url: dataUrl, detail: "high" },
          ],
        }],
      } as any);
      const text = (res as any).output_text ?? (res as any).output?.flatMap((o: any) => o.content ?? []).find((c: any) => c.type === "output_text")?.text ?? "";
      const m = String(text).match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch (e) {
      if (e instanceof GatewayError) return { error: e.code === "payment_required" ? "AI-kreditter er brugt op" : "AI kunne ikke læse bilaget lige nu" };
      return { error: "AI-svaret kunne ikke læses" };
    }
    const extraction = { model: "openai/gpt-6-astra", at: new Date().toISOString(), result: parsed, note: "Forslag – skal kontrolleres" };
    await ctx.supabase.from("fin_documents").update({ ai_extraction: extraction }).eq("id", data.id);
    return { extraction };
  });

// ---------- Bank ----------
export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    const accounts = check(await ctx.supabase.from("fin_bank_accounts").select("*").order("created_at")) as any[];
    const statements = check(await ctx.supabase.from("fin_bank_statements").select("*").order("statement_date", { ascending: false })) as any[];
    return { accounts, statements };
  });

export const createBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ name: z.string().min(2).max(100), account_number: z.string().max(40).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    check(await ctx.supabase.from("fin_bank_accounts").insert({ ...data, account_code: ACC.bank }));
    return { ok: true };
  });

export const existingBankKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ bank_account_id: z.string().uuid(), keys: z.array(z.string().max(600)).max(5000) }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const found: string[] = [];
    for (let i = 0; i < data.keys.length; i += 200) {
      const rows = check(await ctx.supabase.from("fin_bank_transactions").select("dedupe_key").eq("bank_account_id", data.bank_account_id).in("dedupe_key", data.keys.slice(i, i + 200))) as any[];
      found.push(...rows.map((r) => r.dedupe_key));
    }
    return found;
  });

const bankRow = z.object({
  booked_on: z.string().date(), amount_minor: z.number().int(), text: z.string().max(500),
  balance_after_minor: z.number().int().nullable(), bank_tx_id: z.string().max(200).nullable(), dedupe_key: z.string().max(600),
  include_anyway: z.boolean().default(false),
});
export const importBankRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    bank_account_id: z.string().uuid(), filename: z.string().max(200), rows: z.array(bankRow).max(5000),
    statement_date: z.string().date().nullable(), statement_balance_minor: z.number().int().nullable(), document_id: z.string().uuid().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const imp = check(await ctx.supabase.from("fin_bank_imports").insert({
      bank_account_id: data.bank_account_id, filename: data.filename, row_count: data.rows.length,
      statement_date: data.statement_date, statement_balance_minor: data.statement_balance_minor, document_id: data.document_id, imported_by: ctx.userId,
    }).select("id").single()) as any;
    let inserted = 0, skipped = 0;
    for (const r of data.rows) {
      const { include_anyway, ...row } = r;
      let key = row.dedupe_key;
      let dupOf: string | null = null;
      if (include_anyway) {
        const ex = (await ctx.supabase.from("fin_bank_transactions").select("id").eq("bank_account_id", data.bank_account_id).eq("dedupe_key", key).maybeSingle()).data;
        dupOf = ex?.id ?? null;
        key = `${key}~${imp.id}`;
      }
      const res = await ctx.supabase.from("fin_bank_transactions").upsert(
        { ...row, dedupe_key: key, bank_account_id: data.bank_account_id, import_id: imp.id, suspected_duplicate_of: dupOf },
        { onConflict: "bank_account_id,dedupe_key", ignoreDuplicates: true },
      ).select("id");
      if (res.error) throw new Error(res.error.message);
      if ((res.data ?? []).length) inserted++; else skipped++;
    }
    if (data.statement_date && data.statement_balance_minor !== null) {
      await ctx.supabase.from("fin_bank_statements").upsert({
        bank_account_id: data.bank_account_id, statement_date: data.statement_date, balance_minor: data.statement_balance_minor, document_id: data.document_id, created_by: ctx.userId,
      }, { onConflict: "bank_account_id,statement_date" });
    }
    return { inserted, skipped };
  });

export const addBankStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ bank_account_id: z.string().uuid(), statement_date: z.string().date(), balance_minor: z.number().int(), document_id: z.string().uuid().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    check(await ctx.supabase.from("fin_bank_statements").upsert({ ...data, created_by: ctx.userId }, { onConflict: "bank_account_id,statement_date" }));
    return { ok: true };
  });

export const listBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ status: z.enum(["all", "unmatched", "matched", "ignored"]).default("all") }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    let q = ctx.supabase.from("fin_bank_transactions").select("*").order("booked_on", { ascending: false }).limit(1000);
    if (data.status !== "all") q = q.eq("status", data.status);
    return check(await q) as any[];
  });

/** Candidates: Stripe payouts in transit with the same amount, open bills, outstanding reimbursement debt. */
export const matchCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    const bt = check(await ctx.supabase.from("fin_bank_transactions").select("*").eq("id", data.id).single()) as any;
    const amt = Number(bt.amount_minor);
    const payouts = amt > 0
      ? (check(await ctx.supabase.from("fin_stripe_objects").select("stripe_id,environment,amount_minor,status,stripe_created_at,data->arrival_date").eq("object_type", "payout").eq("amount_minor", amt).eq("is_historical", false).limit(20)) as any[])
      : [];
    const usedPayouts = new Set(((check(await ctx.supabase.from("fin_journal_entries").select("source_key").eq("source_type", "payout_bank_match")) as any[]) ?? []).map((r) => r.source_key));
    const bills = amt < 0 ? await openBills(ctx) : [];
    return { tx: bt, payouts: payouts.filter((p) => !usedPayouts.has(`${p.environment}|${p.stripe_id}`)), bills };
  });

async function openBills(ctx: Ctx) {
  const bills = check(await ctx.supabase.from("fin_bills").select("*, fin_bill_payments(amount_minor)").eq("paid_by", "association").order("invoice_date")) as any[];
  return bills.map((b) => ({ ...b, paid: b.fin_bill_payments.reduce((s: number, p: any) => s + Number(p.amount_minor), 0) }))
    .filter((b) => b.paid < Number(b.amount_dkk_minor));
}

export const matchBankTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.discriminatedUnion("type", [
    z.object({ type: z.literal("payout"), id: z.string().uuid(), environment: z.enum(["sandbox", "live"]), payout_id: z.string().max(100) }),
    z.object({ type: z.literal("bill"), id: z.string().uuid(), bill_id: z.string().uuid(), amount_minor: z.number().int().positive() }),
    z.object({ type: z.literal("direct"), id: z.string().uuid(), account: z.string().min(4).max(10), description: z.string().min(2).max(300), document_ids: z.array(z.string().uuid()).max(20).default([]) }),
    z.object({ type: z.literal("ignore"), id: z.string().uuid(), note: z.string().min(3).max(300) }),
    z.object({ type: z.literal("unmatch_ignore"), id: z.string().uuid() }),
  ]).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const bt = check(await ctx.supabase.from("fin_bank_transactions").select("*").eq("id", data.id).single()) as any;
    if (data.type === "unmatch_ignore") {
      if (bt.status !== "ignored") throw new Error("Kun ignorerede poster kan genåbnes");
      check(await ctx.supabase.from("fin_bank_transactions").update({ status: "unmatched", note: null }).eq("id", bt.id));
      return { ok: true };
    }
    if (bt.status !== "unmatched") throw new Error("Bankposteringen er allerede behandlet");
    const acct = check(await ctx.supabase.from("fin_bank_accounts").select("account_code").eq("id", bt.bank_account_id).single()) as any;
    const amt = Number(bt.amount_minor);
    let entryId: string | null = null;
    if (data.type === "ignore") {
      check(await ctx.supabase.from("fin_bank_transactions").update({ status: "ignored", note: data.note }).eq("id", bt.id));
      return { ok: true };
    }
    if (data.type === "payout") {
      const po = check(await ctx.supabase.from("fin_stripe_objects").select("amount_minor,is_historical").eq("environment", data.environment).eq("object_type", "payout").eq("stripe_id", data.payout_id).single()) as any;
      if (Number(po.amount_minor) !== amt) throw new Error("Beløbet matcher ikke udbetalingen");
      if (po.is_historical) throw new Error("Historiske udbetalinger før skæringspunktet matches ikke automatisk");
      const e = check(await ctx.supabase.from("fin_journal_entries").insert({
        entry_date: bt.booked_on, description: `Stripe-udbetaling ${data.payout_id} modtaget i bank`, kind: "bank",
        source_type: "payout_bank_match", source_key: `${data.environment}|${data.payout_id}`, created_by: ctx.userId,
      }).select("id").single()) as any;
      check(await ctx.supabase.from("fin_journal_lines").insert([
        { entry_id: e.id, line_no: 1, account_code: acct.account_code, debit_minor: amt, credit_minor: 0 },
        { entry_id: e.id, line_no: 2, account_code: ACC.transit, debit_minor: 0, credit_minor: amt },
      ]));
      check(await ctx.supabase.rpc("fin_post_entry", { _entry_id: e.id }));
      entryId = e.id;
    } else if (data.type === "bill") {
      if (amt >= 0) throw new Error("Kun udbetalinger kan betale en faktura");
      if (data.amount_minor !== -amt) throw new Error("Hele bankposteringen skal bruges på én faktura (en faktura kan godt betales af flere bankposteringer)");
      const bill = (await openBills(ctx)).find((b) => b.id === data.bill_id);
      if (!bill) throw new Error("Fakturaen er betalt eller findes ikke");
      if (data.amount_minor > Number(bill.amount_dkk_minor) - bill.paid) throw new Error("Beløbet er større end restbeløbet på fakturaen");
      entryId = await postNew(ctx, { entry_date: bt.booked_on, description: `Betaling: ${bill.supplier}`, kind: "bill_payment" }, [
        { account: ACC.payables, debit: data.amount_minor, credit: 0 },
        { account: acct.account_code, debit: 0, credit: data.amount_minor },
      ]);
      check(await ctx.supabase.from("fin_bill_payments").insert({ bill_id: bill.id, bank_transaction_id: bt.id, paid_on: bt.booked_on, amount_minor: data.amount_minor, journal_entry_id: entryId, created_by: ctx.userId }));
    } else {
      const abs = Math.abs(amt);
      entryId = await postNew(ctx, { entry_date: bt.booked_on, description: data.description, kind: "bank", document_ids: data.document_ids }, amt > 0
        ? [{ account: acct.account_code, debit: abs, credit: 0 }, { account: data.account, debit: 0, credit: abs }]
        : [{ account: data.account, debit: abs, credit: 0 }, { account: acct.account_code, debit: 0, credit: abs }]);
    }
    check(await ctx.supabase.from("fin_bank_transactions").update({ status: "matched", journal_entry_id: entryId }).eq("id", bt.id));
    return { ok: true };
  });

// ---------- Bills ----------
export const createBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    supplier: z.string().min(1).max(200), invoice_date: z.string().date(), due_date: z.string().date().nullable(), description: z.string().max(500).nullable(),
    amount_minor: z.number().int().positive(), currency: z.string().length(3), fx_rate: z.number().positive().nullable(), fx_source: z.string().max(300).nullable(),
    expense_account_code: z.string().min(4).max(10), paid_by: z.enum(["association", "private"]), private_person_name: z.string().max(200).nullable(),
    document_ids: z.array(z.string().uuid()).max(20),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    if (data.currency !== "DKK" && (!data.fx_rate || !data.fx_source)) throw new Error("Fremmed valuta kræver dokumenteret kurs og kilde");
    if (data.paid_by === "private") throw new Error("Privat betalte udgifter registreres som udlæg under Udlæg, så de godkendes af en anden");
    const dkk = data.currency === "DKK" ? data.amount_minor : Math.round(data.amount_minor * (data.fx_rate as number));
    const bill = check(await ctx.supabase.from("fin_bills").insert({ ...data, amount_dkk_minor: dkk, created_by: ctx.userId }).select("id").single()) as any;
    const e = check(await ctx.supabase.from("fin_journal_entries").insert({
      entry_date: data.invoice_date, description: `Faktura: ${data.supplier}${data.description ? ` – ${data.description}` : ""}`, kind: "bill", document_ids: data.document_ids, created_by: ctx.userId,
    }).select("id").single()) as any;
    check(await ctx.supabase.from("fin_journal_lines").insert([
      { entry_id: e.id, line_no: 1, account_code: data.expense_account_code, debit_minor: dkk, credit_minor: 0, original_currency: data.currency, original_amount_minor: data.amount_minor, fx_rate: data.fx_rate, fx_source: data.fx_source },
      { entry_id: e.id, line_no: 2, account_code: ACC.payables, debit_minor: 0, credit_minor: dkk, original_currency: data.currency, original_amount_minor: data.amount_minor, fx_rate: data.fx_rate, fx_source: data.fx_source },
    ]));
    check(await ctx.supabase.rpc("fin_post_entry", { _entry_id: e.id }));
    check(await ctx.supabase.from("fin_bills").update({ journal_entry_id: e.id }).eq("id", bill.id));
    return { id: bill.id };
  });

export const listBills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    const bills = check(await ctx.supabase.from("fin_bills").select("*, fin_bill_payments(*)").order("invoice_date", { ascending: false })) as any[];
    return bills.map((b) => ({ ...b, paid: b.fin_bill_payments.reduce((s: number, p: any) => s + Number(p.amount_minor), 0) }));
  });

export const attachDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ target: z.enum(["bill", "entry"]), id: z.string().uuid(), document_ids: z.array(z.string().uuid()).max(30) }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    if (data.target === "bill") check(await ctx.supabase.from("fin_bills").update({ document_ids: data.document_ids }).eq("id", data.id));
    else {
      const e = check(await ctx.supabase.from("fin_journal_entries").select("status").eq("id", data.id).single()) as any;
      if (e.status === "posted") throw new Error("Bilag på bogførte poster tilknyttes via fakturaen eller en ny post");
      check(await ctx.supabase.from("fin_journal_entries").update({ document_ids: data.document_ids }).eq("id", data.id));
    }
    return { ok: true };
  });
