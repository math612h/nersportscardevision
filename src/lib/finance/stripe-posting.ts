import { ACC } from "./accounts";
import { compact, isBalanced, line, type Line } from "./ledger";
import type { CategoryResult } from "./categorize";

/** Subset of a Stripe balance transaction we rely on. */
export interface BalanceTx {
  id: string;
  amount: number; // minor, signed
  fee: number; // minor, >= 0 normally (can be negative on reversals)
  net: number; // amount - fee
  currency: string;
  created: number; // unix seconds
  type: string;
  reporting_category: string;
  source: string | null;
  status?: "available" | "pending";
}

export type PostingDecision =
  | { kind: "post"; lines: Line[]; description: string; explanation: string; needsCategory: boolean }
  | { kind: "historical"; reason: string }
  | { kind: "review"; reason: string; lines?: Line[] };

/** Categories whose "amount" side hits the income account chosen by the category rules. */
const INCOME_SIDE = new Set([
  "charge",
  "refund",
  "refund_failure",
  "dispute",
  "dispute_reversal",
  "charge_failure",
  "partial_capture_reversal",
]);
const PAYOUT_SIDE = new Set(["payout", "payout_reversal"]);
const FEE_SIDE = new Set(["fee", "stripe_fee", "network_cost"]);

const LABEL: Record<string, string> = {
  charge: "Betaling",
  refund: "Refundering",
  refund_failure: "Refundering fejlede",
  dispute: "Indsigelse (dispute)",
  dispute_reversal: "Indsigelse vundet/tilbageført",
  charge_failure: "Betaling fejlede efterfølgende",
  payout: "Udbetaling til bank",
  payout_reversal: "Udbetaling fejlede/tilbageført",
  fee: "Stripe-gebyr",
};

/**
 * Turn one balance transaction into journal lines.
 *  stripe balance  += net
 *  fees expense    += fee
 *  counter account -= amount  (income for payments, transit for payouts, fees for fee items)
 * net = amount - fee, so the entry always balances.
 */
export function decidePosting(
  bt: BalanceTx,
  opts: { cutoffAt: Date | null; category: CategoryResult | null },
): PostingDecision {
  if (bt.net !== bt.amount - bt.fee) return { kind: "review", reason: "Netto stemmer ikke med beløb minus gebyr" };
  if (!opts.cutoffAt) return { kind: "review", reason: "Skæringspunkt er ikke godkendt" };
  if (bt.created * 1000 < opts.cutoffAt.getTime()) {
    return { kind: "historical", reason: "Før skæringspunktet – kun dokumentation (indgår i åbningsbeholdningen)" };
  }
  if (bt.currency.toLowerCase() !== "dkk") {
    return { kind: "review", reason: `Valuta ${bt.currency.toUpperCase()} kræver dokumenteret omregning` };
  }
  const rc = bt.reporting_category;
  const label = LABEL[rc] ?? rc;
  let counter: string;
  let explanation: string;
  let needsCategory = false;
  if (INCOME_SIDE.has(rc)) {
    needsCategory = true;
    if (!opts.category || opts.category.status !== "matched") {
      return { kind: "review", reason: opts.category?.status === "review" ? opts.category.reason : "Mangler kategori" };
    }
    counter = opts.category.rule.account_code;
    explanation = opts.category.explanation;
  } else if (PAYOUT_SIDE.has(rc)) {
    counter = ACC.transit;
    explanation = "Intern overførsel Stripe → bank (ingen indtægt)";
  } else if (FEE_SIDE.has(rc)) {
    counter = ACC.fees;
    explanation = "Gebyr opkrævet af Stripe";
  } else {
    return { kind: "review", reason: `Ukendt Stripe-kategori "${rc}" (type ${bt.type})` };
  }
  const lines = compact([
    line(ACC.stripe, bt.net, label),
    line(ACC.fees, bt.fee, "Stripe-gebyr"),
    line(counter, -bt.amount, label),
  ]);
  // Merge same-account lines (fee items post fee and counter to same account)
  const merged = mergeLines(lines);
  if (!isBalanced(merged)) return { kind: "review", reason: "Posteringen balancerer ikke" };
  return { kind: "post", lines: merged, description: `${label} ${bt.id}`, explanation, needsCategory };
}

function mergeLines(lines: Line[]): Line[] {
  const by = new Map<string, number>();
  for (const l of lines) by.set(l.account, (by.get(l.account) ?? 0) + l.debit - l.credit);
  return compact([...by.entries()].map(([a, v]) => line(a, v)));
}

/**
 * Idempotency key for a posted Stripe movement. Only balance transactions
 * are ever posted, so a payment seen as session/PI/charge/invoice still maps
 * to exactly one key.
 */
export function stripePostingKey(env: string, account: string, btId: string) {
  return `${account}|${env}|${btId}`;
}
