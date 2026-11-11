export interface Line {
  account: string;
  debit: number; // minor units, >= 0
  credit: number; // minor units, >= 0
  memo?: string;
}

export function isBalanced(lines: Line[]): boolean {
  if (lines.length === 0) return false;
  let d = 0;
  let c = 0;
  for (const l of lines) {
    if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit)) return false;
    if (l.debit < 0 || l.credit < 0) return false;
    if (l.debit > 0 && l.credit > 0) return false;
    d += l.debit;
    c += l.credit;
  }
  return d > 0 && d === c;
}

/** Signed amount helper: positive = debit, negative = credit. Zero amounts are dropped. */
export function line(account: string, signed: number, memo?: string): Line | null {
  if (signed === 0) return null;
  return signed > 0
    ? { account, debit: signed, credit: 0, memo }
    : { account, debit: 0, credit: -signed, memo };
}

export function compact(lines: (Line | null)[]): Line[] {
  return lines.filter((l): l is Line => l !== null);
}

export function reverseLines(lines: Line[]): Line[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit, memo: l.memo ? `Tilbageførsel: ${l.memo}` : "Tilbageførsel" }));
}

/** Balance per account (debit - credit). */
export function balances(entries: { lines: Line[] }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) for (const l of e.lines) out[l.account] = (out[l.account] ?? 0) + l.debit - l.credit;
  return out;
}

/** Parse "1.374,74" / "1374.74" / "-12,5" into øre. Throws on ambiguous input. */
export function parseDkkToMinor(input: string): number {
  let s = input.trim().replace(/\s|kr\.?|DKK/gi, "");
  if (!s) throw new Error("Tomt beløb");
  const neg = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
  s = s.replace(/^[-+(]|\)$/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Ugyldigt beløb: ${input}`);
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return neg ? -minor : minor;
}

export function formatDkk(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const kr = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${kr},${String(abs % 100).padStart(2, "0")} kr.`;
}
