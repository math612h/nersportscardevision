import { parseDkkToMinor } from "./ledger";

export interface BankRow {
  booked_on: string; // YYYY-MM-DD
  amount_minor: number;
  text: string;
  balance_after_minor: number | null;
  bank_tx_id: string | null;
}

export interface KeyedBankRow extends BankRow {
  dedupe_key: string;
  duplicate: boolean; // key already exists in the database
}

export interface ColumnMap {
  date: number;
  amount: number;
  text: number;
  balance?: number;
  id?: number;
}

export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function detectSeparator(header: string): string {
  const counts = [";", ",", "\t"].map((s) => [s, header.split(s).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export function parseDate(s: string): string {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  throw new Error(`Ugyldig dato: ${s}`);
}

export function parseBankCsv(csv: string, map: ColumnMap, skipHeader = true): { rows: BankRow[]; errors: string[] } {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: [], errors: ["Filen er tom"] };
  const sep = detectSeparator(lines[0]);
  const rows: BankRow[] = [];
  const errors: string[] = [];
  lines.slice(skipHeader ? 1 : 0).forEach((l, i) => {
    const c = splitCsvLine(l, sep);
    try {
      rows.push({
        booked_on: parseDate(c[map.date] ?? ""),
        amount_minor: parseDkkToMinor(c[map.amount] ?? ""),
        text: c[map.text] ?? "",
        balance_after_minor: map.balance !== undefined && c[map.balance] ? parseDkkToMinor(c[map.balance]) : null,
        bank_tx_id: map.id !== undefined && c[map.id] ? c[map.id] : null,
      });
    } catch (e) {
      errors.push(`Linje ${i + (skipHeader ? 2 : 1)}: ${(e as Error).message}`);
    }
  });
  return { rows, errors };
}

/**
 * Stable keys. Bank IDs win. Without an ID, identical lines in the same file
 * get an occurrence number so two genuine identical payments are both kept;
 * re-importing the same file yields the same keys and is flagged.
 */
export function assignDedupeKeys(rows: BankRow[], existingKeys: Set<string>): KeyedBankRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    let key: string;
    if (r.bank_tx_id) key = `id:${r.bank_tx_id}`;
    else {
      const base = `fp:${r.booked_on}|${r.amount_minor}|${r.text.toLowerCase().replace(/\s+/g, " ")}|${r.balance_after_minor ?? ""}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      key = `${base}#${n}`;
    }
    return { ...r, dedupe_key: key, duplicate: existingKeys.has(key) };
  });
}
