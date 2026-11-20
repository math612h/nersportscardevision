import { splitCsvLine } from "./bank-import";
import { parseDkkToMinor } from "./ledger";

/** Reads ending balance (øre) from a Stripe balance.summary.2 CSV: row category=ending_balance, currency=dkk, net_amount in kroner. Throws if missing/unreadable. */
export function endingBalanceFromCsv(csv: string): number {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Stripe-CSV'en er tom eller ulæselig");
  const head = splitCsvLine(lines[0]!, ",").map((h) => h.trim().toLowerCase());
  const ci = head.indexOf("category"), cu = head.indexOf("currency"), na = head.indexOf("net_amount");
  if (ci < 0 || cu < 0 || na < 0) throw new Error("Stripe-CSV'en mangler kolonnerne category, currency eller net_amount");
  for (const l of lines.slice(1)) {
    const c = splitCsvLine(l, ",");
    if (c[ci]?.trim() === "ending_balance" && c[cu]?.trim().toLowerCase() === "dkk") {
      const raw = (c[na] ?? "").trim();
      if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) throw new Error(`Ulæseligt net_amount i Stripe-CSV: ${raw}`);
      return parseDkkToMinor(raw);
    }
  }
  throw new Error("Stripe-CSV'en har ingen række med ending_balance i DKK");
}

/** Returns the approved cutoff as unix seconds, or throws. */
export function approvedCutoffUnix(s: { cutoff_at: string | null; cutoff_approved_at: string | null }): number {
  if (!s.cutoff_at) throw new Error("Skæringspunktet er ikke angivet");
  if (!s.cutoff_approved_at) throw new Error("Skæringspunktet er ikke godkendt");
  return Math.floor(new Date(s.cutoff_at).getTime() / 1000);
}
