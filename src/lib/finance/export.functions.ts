import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatDkk, isBalanced } from "./ledger";

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
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula guard
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
const kr = (m: number) => (m / 100).toFixed(2).replace(".", ",");
async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function postedLines(ctx: Ctx, from?: string, to?: string) {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    let q = ctx.supabase.from("fin_journal_lines").select("*, fin_journal_entries!inner(entry_no,entry_date,description,status,kind,source_key)").eq("fin_journal_entries.status", "posted").range(off, off + 999);
    if (from) q = q.gte("fin_journal_entries.entry_date", from);
    if (to) q = q.lte("fin_journal_entries.entry_date", to);
    const rows = check(await q) as any[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export const getReportData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ from: z.string().date(), to: z.string().date() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    const accounts = check(await ctx.supabase.from("fin_accounts").select("*").order("code")) as any[];
    const all = await postedLines(ctx, undefined, data.to);
    const period: Record<string, number> = {};
    const closing: Record<string, number> = {};
    for (const l of all) {
      const v = Number(l.debit_minor) - Number(l.credit_minor);
      closing[l.account_code] = (closing[l.account_code] ?? 0) + v;
      if (l.fin_journal_entries.entry_date >= data.from) period[l.account_code] = (period[l.account_code] ?? 0) + v;
    }
    return { accounts, period, closing };
  });

export const exportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ kind: z.enum(["journal", "accounts", "documents"]), from: z.string().date().optional(), to: z.string().date().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    if (data.kind === "journal") {
      const lines = await postedLines(ctx, data.from, data.to);
      lines.sort((a, b) => a.fin_journal_entries.entry_no - b.fin_journal_entries.entry_no || a.line_no - b.line_no);
      return { filename: "journal.csv", csv: toCsv([["Bilagsnr", "Dato", "Tekst", "Konto", "Debet", "Kredit", "Valuta", "Oprindeligt beløb", "Kurs", "Kurskilde", "Kilde-ID"],
        ...lines.map((l) => [l.fin_journal_entries.entry_no, l.fin_journal_entries.entry_date, l.fin_journal_entries.description, l.account_code, kr(Number(l.debit_minor)), kr(Number(l.credit_minor)), l.original_currency, l.original_amount_minor !== null ? kr(Number(l.original_amount_minor)) : "", l.fx_rate ?? "", l.fx_source ?? "", l.fin_journal_entries.source_key ?? ""])]) };
    }
    if (data.kind === "accounts") {
      const lines = await postedLines(ctx, data.from, data.to);
      const accounts = check(await ctx.supabase.from("fin_accounts").select("*").order("code")) as any[];
      const rows: unknown[][] = [["Konto", "Navn", "Bilagsnr", "Dato", "Tekst", "Debet", "Kredit", "Saldo"]];
      for (const a of accounts) {
        let bal = 0;
        for (const l of lines.filter((x) => x.account_code === a.code).sort((x, y) => x.fin_journal_entries.entry_date.localeCompare(y.fin_journal_entries.entry_date))) {
          bal += Number(l.debit_minor) - Number(l.credit_minor);
          rows.push([a.code, a.name, l.fin_journal_entries.entry_no, l.fin_journal_entries.entry_date, l.fin_journal_entries.description, kr(Number(l.debit_minor)), kr(Number(l.credit_minor)), kr(bal)]);
        }
      }
      return { filename: "kontospecifikation.csv", csv: toCsv(rows) };
    }
    const docs = check(await ctx.supabase.from("fin_documents").select("*").order("created_at")) as any[];
    return { filename: "bilagsoversigt.csv", csv: toCsv([["ID", "Filnavn", "Type", "Beskrivelse", "Størrelse", "SHA-256", "Uploadet"], ...docs.map((d) => [d.id, d.filename, d.kind, d.description ?? "", d.size_bytes, d.sha256 ?? "", d.created_at])]) };
  });

const BACKUP_TABLES = [
  "fin_settings", "fin_membership_rates", "fin_accounts", "fin_periods", "fin_journal_entries", "fin_journal_lines", "fin_approvals",
  "fin_category_rules", "fin_documents", "fin_bank_accounts", "fin_bank_imports", "fin_bank_transactions", "fin_bank_statements",
  "fin_bills", "fin_bill_payments", "fin_reimbursement_claims", "fin_repayments", "fin_stripe_objects", "fin_stripe_events",
  "fin_stripe_sync_state", "fin_sync_errors", "fin_audit_log", "fin_user_roles",
];

async function readAll(ctx: Ctx, table: string) {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const rows = check(await ctx.supabase.from(table).select("*").range(off, off + 999)) as any[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/**
 * Full export: every finance table as JSON + every document file + manifest
 * with SHA-256 per file, row counts and account balances. Stored privately and
 * returned as a short-lived download link. No API keys are included.
 */
export const createFullBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ includeStripeRaw: z.boolean().default(true) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sbAdmin = supabaseAdmin as any;
    const run = check(await sbAdmin.from("fin_backup_runs").insert({ kind: "download", started_by: ctx.userId }).select("id").single()) as any;
    try {
      const { zipSync, strToU8 } = await import("fflate");
      const files: Record<string, Uint8Array> = {};
      const manifest: any = { created_at: new Date().toISOString(), format: "lmudanmark-finance-v1", tables: {}, files: {}, balances: {} };
      for (const t of BACKUP_TABLES) {
        if (!data.includeStripeRaw && t === "fin_stripe_objects") continue;
        const rows = await readAll(ctx, t);
        const bytes = strToU8(JSON.stringify(rows));
        files[`data/${t}.json`] = bytes;
        manifest.tables[t] = { rows: rows.length, sha256: await sha256(bytes) };
        if (t === "fin_journal_lines") {
          const entries = JSON.parse(new TextDecoder().decode(files["data/fin_journal_entries.json"]));
          const posted = new Set(entries.filter((e: any) => e.status === "posted").map((e: any) => e.id));
          for (const l of rows) if (posted.has(l.entry_id)) manifest.balances[l.account_code] = (manifest.balances[l.account_code] ?? 0) + Number(l.debit_minor) - Number(l.credit_minor);
        }
      }
      const docs = await readAll(ctx, "fin_documents");
      for (const d of docs) {
        const f = await ctx.supabase.storage.from("accounting-docs").download(d.storage_path);
        if (f.error) { manifest.files[d.storage_path] = { error: f.error.message }; continue; }
        const b = new Uint8Array(await f.data.arrayBuffer());
        files[`files/${d.storage_path}`] = b;
        manifest.files[d.storage_path] = { size: b.byteLength, sha256: await sha256(b), expected_sha256: d.sha256 };
      }
      files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
      files["LÆS-MIG.txt"] = strToU8("Fuld eksport af LMUdanmarks regnskabsdata. data/*.json indeholder alle tabeller; files/ indeholder alle bilag; manifest.json har kontrolsummer, antal rækker og saldi. Formatet kan læses af andre systemer (fx ved flytning til Dinero) via CSV-eksporterne eller direkte fra JSON.");
      const zip = zipSync(files, { level: 6 });
      const path = `backups/${manifest.created_at.replace(/[:.]/g, "-")}.zip`;
      const up = await sbAdmin.storage.from("accounting-docs").upload(path, zip, { contentType: "application/zip" });
      if (up.error) throw new Error(up.error.message);
      const url = await sbAdmin.storage.from("accounting-docs").createSignedUrl(path, 600);
      await sbAdmin.from("fin_backup_runs").update({
        status: "succeeded", destination: path, size_bytes: zip.byteLength, file_count: docs.length,
        row_counts: Object.fromEntries(Object.entries(manifest.tables).map(([k, v]: any) => [k, v.rows])), finished_at: new Date().toISOString(),
      }).eq("id", run.id);
      return { url: url.data?.signedUrl as string, size: zip.byteLength, runId: run.id };
    } catch (e) {
      await sbAdmin.from("fin_backup_runs").update({ status: "failed", error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", run.id);
      throw e;
    }
  });

/**
 * Restore test: opens a stored export in isolation (in memory, never touches
 * live tables) and verifies that it can be read back completely.
 */
export const runRestoreTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ runId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sbAdmin = supabaseAdmin as any;
    const src = check(await sbAdmin.from("fin_backup_runs").select("*").eq("id", data.runId).single()) as any;
    if (src.status !== "succeeded" || !src.destination) throw new Error("Eksporten er ikke gennemført");
    const run = check(await sbAdmin.from("fin_backup_runs").insert({ kind: "restore_test", started_by: ctx.userId, destination: src.destination }).select("id").single()) as any;
    const checks: { name: string; ok: boolean; detail?: string }[] = [];
    try {
      const { unzipSync } = await import("fflate");
      const f = await sbAdmin.storage.from("accounting-docs").download(src.destination);
      if (f.error) throw new Error(f.error.message);
      const files = unzipSync(new Uint8Array(await f.data.arrayBuffer()));
      const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
      checks.push({ name: "Manifest kan læses", ok: !!manifest.tables });
      const tables: Record<string, any[]> = {};
      for (const [t, meta] of Object.entries<any>(manifest.tables)) {
        const b = files[`data/${t}.json`];
        const ok = !!b && (await sha256(b)) === meta.sha256;
        tables[t] = b ? JSON.parse(new TextDecoder().decode(b)) : [];
        checks.push({ name: `Tabel ${t}`, ok: ok && tables[t].length === meta.rows, detail: `${tables[t].length}/${meta.rows} rækker` });
      }
      let fileOk = 0, fileBad = 0;
      for (const [p, meta] of Object.entries<any>(manifest.files)) {
        const b = files[`files/${p}`];
        if (b && (await sha256(b)) === meta.sha256 && (!meta.expected_sha256 || meta.expected_sha256 === meta.sha256)) fileOk++; else fileBad++;
      }
      checks.push({ name: "Bilagsfiler og kontrolsummer", ok: fileBad === 0, detail: `${fileOk} ok, ${fileBad} fejl` });
      const posted = (tables.fin_journal_entries ?? []).filter((e) => e.status === "posted");
      const byEntry = new Map<string, any[]>();
      for (const l of tables.fin_journal_lines ?? []) byEntry.set(l.entry_id, [...(byEntry.get(l.entry_id) ?? []), l]);
      const unbalanced = posted.filter((e) => !isBalanced((byEntry.get(e.id) ?? []).map((l) => ({ account: l.account_code, debit: Number(l.debit_minor), credit: Number(l.credit_minor) }))));
      checks.push({ name: "Alle bogførte poster balancerer", ok: unbalanced.length === 0, detail: `${posted.length} poster, ${unbalanced.length} ubalancerede` });
      const recomputed: Record<string, number> = {};
      const postedIds = new Set(posted.map((e) => e.id));
      for (const l of tables.fin_journal_lines ?? []) if (postedIds.has(l.entry_id)) recomputed[l.account_code] = (recomputed[l.account_code] ?? 0) + Number(l.debit_minor) - Number(l.credit_minor);
      const diff = Object.keys({ ...recomputed, ...manifest.balances }).filter((k) => (recomputed[k] ?? 0) !== (manifest.balances[k] ?? 0));
      checks.push({ name: "Saldi pr. konto genskabt", ok: diff.length === 0, detail: diff.length ? `Afvigelse på ${diff.join(", ")}` : `${Object.keys(recomputed).length} konti` });
      const ok = checks.every((c) => c.ok);
      await sbAdmin.from("fin_backup_runs").update({ status: ok ? "succeeded" : "failed", checks, finished_at: new Date().toISOString() }).eq("id", run.id);
      return { ok, checks };
    } catch (e) {
      checks.push({ name: "Gendannelse", ok: false, detail: (e as Error).message });
      await sbAdmin.from("fin_backup_runs").update({ status: "failed", checks, error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", run.id);
      return { ok: false, checks };
    }
  });

export const getBackupDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ runId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = check(await (supabaseAdmin as any).from("fin_backup_runs").select("destination,status").eq("id", data.runId).single()) as any;
    if (r.status !== "succeeded" || !r.destination?.startsWith("backups/")) throw new Error("Ingen fil");
    const u = await (supabaseAdmin as any).storage.from("accounting-docs").createSignedUrl(r.destination, 600);
    return { url: u.data?.signedUrl as string };
  });

export const annualReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ year: z.number().int().min(2026).max(2100) }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireFin(ctx);
    const from = `${data.year}-01-01`, to = `${data.year}-12-31`;
    const accounts = check(await ctx.supabase.from("fin_accounts").select("*").order("code")) as any[];
    const settings = check(await ctx.supabase.from("fin_settings").select("*").eq("id", 1).single()) as any;
    const period = check(await ctx.supabase.from("fin_periods").select("*").eq("kind", "year").eq("period_start", from).maybeSingle()) as any;
    const approvals = period ? (check(await ctx.supabase.from("fin_approvals").select("*").in("subject_type", ["period_board", "period_general_assembly"]).eq("subject_id", period.id)) as any[]) : [];
    const lines = await postedLines(ctx, undefined, to);
    const per: Record<string, number> = {}, clo: Record<string, number> = {};
    for (const l of lines) {
      const v = Number(l.debit_minor) - Number(l.credit_minor);
      clo[l.account_code] = (clo[l.account_code] ?? 0) + v;
      if (l.fin_journal_entries.entry_date >= from) per[l.account_code] = (per[l.account_code] ?? 0) + v;
    }
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    let y = 800;
    const safe = (s: string) => s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "-");
    const write = (t: string, o: { b?: boolean; size?: number; x?: number; right?: string } = {}) => {
      if (y < 60) { page = pdf.addPage([595, 842]); y = 800; }
      const size = o.size ?? 10;
      page.drawText(safe(t), { x: o.x ?? 50, y, size, font: o.b ? bold : font, color: rgb(0, 0, 0) });
      if (o.right) { const w = font.widthOfTextAtSize(safe(o.right), size); page.drawText(safe(o.right), { x: 545 - w, y, size, font: o.b ? bold : font }); }
      y -= size + 6;
    };
    const stage = period?.approval_stage === "general_assembly_approved" ? "Godkendt af generalforsamlingen" : period?.approval_stage === "board_approved" ? "Godkendt af bestyrelsen – afventer generalforsamling" : "KLADDE – ikke godkendt";
    write(`${settings.org_name} – Årsregnskab ${data.year}`, { b: true, size: 16 });
    write(`Periode ${from} – ${to}. Status: ${stage}`);
    write("Udarbejdet i foreningens interne bogføringsmodul. Ikke et certificeret bogføringssystem.", { size: 8 });
    y -= 8;
    const section = (title: string, types: string[], src: Record<string, number>, sign: number) => {
      write(title, { b: true, size: 12 });
      let total = 0;
      for (const a of accounts.filter((x) => types.includes(x.type))) {
        const v = (src[a.code] ?? 0) * sign;
        if (v === 0) continue;
        total += v;
        write(`${a.code} ${a.name}`, { right: formatDkk(v) });
      }
      write(`I alt`, { b: true, right: formatDkk(total) });
      y -= 6;
      return total;
    };
    write("Resultatopgørelse", { b: true, size: 14 });
    const inc = section("Indtægter", ["income"], per, -1);
    const exp = section("Udgifter", ["expense"], per, 1);
    write("Årets resultat", { b: true, right: formatDkk(inc - exp) });
    y -= 12;
    write(`Balance pr. ${to}`, { b: true, size: 14 });
    const assets = section("Aktiver", ["asset"], clo, 1);
    const liab = section("Gæld", ["liability"], clo, -1);
    const resultToDate = accounts.filter((a) => a.type === "income" || a.type === "expense").reduce((s, a) => s - (clo[a.code] ?? 0), 0);
    const eq = accounts.filter((a) => a.type === "equity").reduce((s, a) => s - (clo[a.code] ?? 0), 0) + resultToDate;
    write("Egenkapital (inkl. akkumuleret resultat)", { b: true, right: formatDkk(eq) });
    write("Passiver i alt", { b: true, right: formatDkk(liab + eq) });
    if (assets !== liab + eq) write("ADVARSEL: Balancen stemmer ikke", { b: true });
    y -= 12;
    write("Godkendelser", { b: true, size: 12 });
    if (approvals.length === 0) write("Ingen registrerede godkendelser.");
    for (const a of approvals) write(`${a.subject_type === "period_board" ? "Bestyrelse" : "Generalforsamling"}: ${a.approver_name} – ${a.decision === "approved" ? "godkendt" : "afvist"} ${String(a.created_at).slice(0, 10)}${a.meeting_date ? ` (møde ${a.meeting_date})` : ""}`);
    if (settings.vat_note) { y -= 8; write("Moms/skat – kassererens afklaring", { b: true }); for (const ln of String(settings.vat_note).match(/.{1,95}(\s|$)/g) ?? []) write(ln.trim(), { size: 9 }); }
    const bytes = await pdf.save();
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { filename: `aarsregnskab-${data.year}.pdf`, base64: btoa(bin) };
  });
