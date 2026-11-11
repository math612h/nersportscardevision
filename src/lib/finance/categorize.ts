import type { Category } from "./accounts";

export interface CategoryRule {
  id: string;
  name: string;
  priority: number; // lower runs first
  match_type: "product_id" | "price_id" | "lookup_key" | "metadata";
  match_key?: string | null;
  match_value: string;
  category: Category;
  account_code: string;
  environment?: "sandbox" | "live" | null;
  active: boolean;
}

export interface PaymentContext {
  environment: "sandbox" | "live";
  productIds: string[];
  priceIds: string[];
  lookupKeys: string[];
  metadata: Record<string, string>;
}

export type CategoryResult =
  | { status: "matched"; rule: CategoryRule; explanation: string }
  | { status: "review"; reason: string };

function ruleMatches(r: CategoryRule, ctx: PaymentContext): boolean {
  if (r.environment && r.environment !== ctx.environment) return false;
  switch (r.match_type) {
    case "product_id":
      return ctx.productIds.includes(r.match_value);
    case "price_id":
      return ctx.priceIds.includes(r.match_value);
    case "lookup_key":
      return ctx.lookupKeys.includes(r.match_value);
    case "metadata":
      return !!r.match_key && ctx.metadata[r.match_key] === r.match_value;
  }
}

/**
 * Deterministic categorisation from documented identifiers only.
 * Never uses the amount. Ambiguity (matching rules disagree on the best
 * priority) or no match => "Kræver kontrol".
 */
export function categorize(rules: CategoryRule[], ctx: PaymentContext): CategoryResult {
  const hits = rules.filter((r) => r.active && ruleMatches(r, ctx)).sort((a, b) => a.priority - b.priority);
  if (hits.length === 0) return { status: "review", reason: "Ingen aktiv regel matcher produkt, pris eller metadata" };
  const top = hits.filter((h) => h.priority === hits[0].priority);
  const cats = new Set(top.map((h) => `${h.category}|${h.account_code}`));
  if (cats.size > 1) return { status: "review", reason: `Tvetydig: reglerne ${top.map((t) => t.name).join(", ")} giver forskellige kategorier` };
  const r = top[0];
  const what = r.match_type === "metadata" ? `metadata ${r.match_key}=${r.match_value}` : `${r.match_type} ${r.match_value}`;
  return { status: "matched", rule: r, explanation: `Regel "${r.name}" (${what})` };
}
