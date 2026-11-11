import { describe, it, expect } from "vitest";
import { ACC } from "./accounts";
import { balances, isBalanced, parseDkkToMinor, reverseLines, type Line } from "./ledger";
import { categorize, type CategoryRule, type PaymentContext } from "./categorize";
import { decidePosting, stripePostingKey, type BalanceTx } from "./stripe-posting";
import { assignDedupeKeys, parseBankCsv } from "./bank-import";
import { canApprove, outstandingDebt, validateRepayment } from "./reimbursement";
import { reconcileBank, reconcileStripe } from "./reconcile";

const cutoff = new Date("2026-11-10T00:00:00Z");
const after = Math.floor(new Date("2026-11-15T12:00:00Z").getTime() / 1000);
const before = Math.floor(new Date("2026-10-01T12:00:00Z").getTime() / 1000);

const donationRule: CategoryRule = {
  id: "r1", name: "Donation-metadata", priority: 10, match_type: "metadata", match_key: "type",
  match_value: "donation", category: "donation", account_code: ACC.donations, active: true,
};
const ctx = (meta: Record<string, string> = { type: "donation" }): PaymentContext => ({
  environment: "live", productIds: [], priceIds: [], lookupKeys: [], metadata: meta,
});
const bt = (o: Partial<BalanceTx>): BalanceTx => ({
  id: "txn_1", amount: 15000, fee: 0, net: 15000, currency: "dkk", created: after,
  type: "charge", reporting_category: "charge", source: "ch_1", ...o,
});

/** In-memory ledger with the same uniqueness rule as the database index. */
class Ledger {
  entries = new Map<string, { lines: Line[] }>();
  post(key: string, lines: Line[]) {
    if (!isBalanced(lines)) throw new Error("unbalanced");
    if (this.entries.has(key)) return false; // ON CONFLICT DO NOTHING
    this.entries.set(key, { lines });
    return true;
  }
  ingest(t: BalanceTx, rules: CategoryRule[] = [donationRule], c = ctx()) {
    const d = decidePosting(t, { cutoffAt: cutoff, category: categorize(rules, c) });
    if (d.kind !== "post") return d.kind;
    return this.post(stripePostingKey("live", "acct", t.id), d.lines) ? "posted" : "duplicate";
  }
  bal() { return balances([...this.entries.values()]); }
}

describe("Stripe-bogføring", () => {
  it("betaling med særskilt gebyr: brutto indtægt, faktisk gebyr, netto i Stripe", () => {
    const L = new Ledger();
    expect(L.ingest(bt({ amount: 15000, fee: 335, net: 14665 }))).toBe("posted");
    expect(L.bal()).toEqual({ [ACC.stripe]: 14665, [ACC.fees]: 335, [ACC.donations]: -15000 });
  });

  it("samme event modtaget to gange giver én post", () => {
    const L = new Ledger();
    const t = bt({ fee: 335, net: 14665 });
    expect(L.ingest(t)).toBe("posted");
    expect(L.ingest(t)).toBe("duplicate");
    expect(L.entries.size).toBe(1);
  });

  it("samtidig bogføring af samme balance transaction giver kun én post", async () => {
    const L = new Ledger();
    const t = bt({});
    const results = await Promise.all([1, 2, 3, 4].map(async () => L.ingest(t)));
    expect(results.filter((r) => r === "posted")).toHaveLength(1);
    expect(L.entries.size).toBe(1);
  });

  it("samme betaling set som session, payment intent, charge og invoice → kun én indtægt", () => {
    const L = new Ledger();
    // Only the balance transaction is posted; the other objects are context.
    const contextObjects = ["cs_1", "pi_1", "ch_1", "in_1"];
    for (const _ of contextObjects) L.ingest(bt({ id: "txn_same" }));
    expect(L.entries.size).toBe(1);
    expect(L.bal()[ACC.donations]).toBe(-15000);
  });

  it("historikimport efterfulgt af webhook for samme transaktion", () => {
    const L = new Ledger();
    expect(L.ingest(bt({ id: "txn_h" }))).toBe("posted"); // import
    expect(L.ingest(bt({ id: "txn_h" }))).toBe("duplicate"); // webhook later
    expect(L.entries.size).toBe(1);
  });

  it("delvis refund nedskriver indtægten med refunderet beløb", () => {
    const L = new Ledger();
    L.ingest(bt({ id: "txn_c", amount: 15000, fee: 335, net: 14665 }));
    L.ingest(bt({ id: "txn_r", amount: -5000, fee: 0, net: -5000, type: "refund", reporting_category: "refund" }));
    const b = L.bal();
    expect(b[ACC.donations]).toBe(-10000);
    expect(b[ACC.stripe]).toBe(9665);
    expect(b[ACC.fees]).toBe(335);
  });

  it("dispute med gebyr og efterfølgende tilbageførsel (vundet)", () => {
    const L = new Ledger();
    L.ingest(bt({ id: "txn_c", amount: 15000, fee: 335, net: 14665 }));
    L.ingest(bt({ id: "txn_d", amount: -15000, fee: 11000, net: -26000, type: "adjustment", reporting_category: "dispute" }));
    let b = L.bal();
    expect(b[ACC.donations]).toBe(0);
    expect(b[ACC.fees]).toBe(11335);
    expect(b[ACC.stripe]).toBe(-11335);
    L.ingest(bt({ id: "txn_dr", amount: 15000, fee: -11000, net: 26000, type: "adjustment", reporting_category: "dispute_reversal" }));
    b = L.bal();
    expect(b[ACC.donations]).toBe(-15000);
    expect(b[ACC.fees]).toBe(335);
    expect(b[ACC.stripe]).toBe(14665);
  });

  it("forsinket betaling (SEPA) der fejler efterfølgende tilbageføres", () => {
    const L = new Ledger();
    L.ingest(bt({ id: "txn_sepa", amount: 15000, fee: 120, net: 14880 }));
    L.ingest(bt({ id: "txn_fail", amount: -15000, fee: 0, net: -15000, type: "payment_failure_refund", reporting_category: "charge_failure" }));
    const b = L.bal();
    expect(b[ACC.donations]).toBe(0);
    expect(b[ACC.stripe]).toBe(-120);
    expect(b[ACC.fees]).toBe(120);
  });

  it("payout matchet til bank giver ingen ny indtægt", () => {
    const L = new Ledger();
    L.ingest(bt({ id: "txn_c", amount: 15000, fee: 335, net: 14665 }));
    L.ingest(bt({ id: "txn_po", amount: -14665, fee: 0, net: -14665, type: "payout", reporting_category: "payout" }));
    // bank receipt matched: Bank debit / Transit credit
    L.post("bank|1", [{ account: ACC.bank, debit: 14665, credit: 0 }, { account: ACC.transit, debit: 0, credit: 14665 }]);
    const b = L.bal();
    expect(b[ACC.donations]).toBe(-15000); // unchanged
    expect(b[ACC.stripe] ?? 0).toBe(0);
    expect(b[ACC.transit] ?? 0).toBe(0);
    expect(b[ACC.bank]).toBe(14665);
  });

  it("ukendt kategori og ukendt betalingstype sendes til kontrol – også en betaling på 150 kr.", () => {
    const L = new Ledger();
    expect(L.ingest(bt({ id: "x1" }), [donationRule], ctx({}))).toBe("review");
    expect(L.ingest(bt({ id: "x2", reporting_category: "climate_order_purchase" }))).toBe("review");
    expect(L.entries.size).toBe(0);
  });

  it("tvetydige regler giver Kræver kontrol", () => {
    const r2: CategoryRule = { ...donationRule, id: "r2", name: "Coaching", category: "coaching", account_code: ACC.coaching };
    expect(categorize([donationRule, r2], ctx()).status).toBe("review");
  });

  it("fremmed valuta sendes til kontrol uden opdigtet kurs", () => {
    const d = decidePosting(bt({ currency: "eur" }), { cutoffAt: cutoff, category: categorize([donationRule], ctx()) });
    expect(d.kind).toBe("review");
  });
});

describe("Åbning og historik", () => {
  it("åbningsbeholdning uden dobbeltregning af historiske Stripe-indbetalinger", () => {
    const L = new Ledger();
    // historical payments before cutoff are documentation only
    expect(L.ingest(bt({ id: "old1", created: before, amount: 50000, fee: 1000, net: 49000 }))).toBe("historical");
    expect(L.ingest(bt({ id: "old2", created: before, amount: -20000, fee: 0, net: -20000, reporting_category: "payout", type: "payout" }))).toBe("historical");
    // opening A: 1.374,74 kr. on the account where the money actually is; counter chosen by the treasurer
    const opening = parseDkkToMinor("1.374,74");
    expect(opening).toBe(137474);
    L.post("opening|A", [{ account: ACC.stripe, debit: opening, credit: 0 }, { account: ACC.equity, debit: 0, credit: opening }]);
    expect(L.post("opening|A", [{ account: ACC.stripe, debit: opening, credit: 0 }, { account: ACC.equity, debit: 0, credit: opening }])).toBe(false);
    const b = L.bal();
    expect(b[ACC.stripe]).toBe(137474);
    expect(b[ACC.donations]).toBeUndefined();
  });
});

describe("Udlæg", () => {
  it("privat udlæg med delvis tilbagebetaling; historiske tilbagebetalinger før skæringspunkt trækkes ikke fra", () => {
    const claims = [{ id: "c1", claimant_id: "m", amount_minor: parseDkkToMinor("7.414,65"), status: "approved" as const, is_opening: true }];
    const repayments = [
      { claimant_id: "m", amount_minor: 100000, paid_on: "2026-10-01" }, // before cutoff: already excluded from statement
      { claimant_id: "m", amount_minor: 200000, paid_on: "2026-12-01" },
    ];
    const rest = outstandingDebt(claims, repayments, "m", "2026-11-10");
    expect(rest).toBe(741465 - 200000);
    expect(validateRepayment(600000, rest)).not.toBeNull();
    expect(validateRepayment(100000, rest)).toBeNull();
  });
  it("man kan ikke godkende sit eget udlæg", () => {
    expect(canApprove({ id: "c", claimant_id: "m", amount_minor: 1, status: "submitted" }, "m")).not.toBeNull();
    expect(canApprove({ id: "c", claimant_id: "m", amount_minor: 1, status: "submitted" }, "b")).toBeNull();
  });
  it("godkendt udlæg og tilbagebetaling bogføres uden dobbelt udgift", () => {
    const L = new Ledger();
    L.post("claim|1", [{ account: ACC.software, debit: 10000, credit: 0 }, { account: ACC.reimbursementDebt, debit: 0, credit: 10000 }]);
    L.post("repay|1", [{ account: ACC.reimbursementDebt, debit: 4000, credit: 0 }, { account: ACC.bank, debit: 0, credit: 4000 }]);
    const b = L.bal();
    expect(b[ACC.software]).toBe(10000);
    expect(b[ACC.reimbursementDebt]).toBe(-6000);
  });
});

describe("Bank-import", () => {
  const csv = `Dato;Tekst;Beløb;Saldo\n15-11-2026;MobilePay Hans;150,00;1.150,00\n15-11-2026;MobilePay Hans;150,00;1.150,00\n16-11-2026;Stripe payout;146,65;1.296,65\n`;
  it("bevarer to identiske linjer og markerer genimport som mulig dublet", () => {
    const { rows, errors } = parseBankCsv(csv, { date: 0, text: 1, amount: 2, balance: 3 });
    expect(errors).toEqual([]);
    const first = assignDedupeKeys(rows, new Set());
    expect(first).toHaveLength(3);
    expect(new Set(first.map((r) => r.dedupe_key)).size).toBe(3);
    const again = assignDedupeKeys(rows, new Set(first.map((r) => r.dedupe_key)));
    expect(again.every((r) => r.duplicate)).toBe(true);
  });
  it("bruger bankens transaktions-ID når det findes", () => {
    const k = assignDedupeKeys([{ booked_on: "2026-11-15", amount_minor: 100, text: "x", balance_after_minor: null, bank_tx_id: "B123" }], new Set());
    expect(k[0].dedupe_key).toBe("id:B123");
  });
});

describe("Afstemning og balance", () => {
  it("Stripe-afstemning med pending, available og reserve pr. valuta", () => {
    const r = reconcileStripe(
      { available: [{ amount: 10000, currency: "dkk" }], pending: [{ amount: 4665, currency: "dkk" }], connect_reserved: [{ amount: 500, currency: "dkk" }] },
      { dkk: 15165 },
    );
    expect(r).toEqual([{ currency: "dkk", available: 10000, pending: 4665, reserved: 500, stripeTotal: 15165, book: 15165, difference: 0 }]);
  });
  it("bankafstemning til kontoudtogets dato", () => {
    const r = reconcileBank([{ date: "2026-11-15", signed: 10000 }, { date: "2026-11-20", signed: 5000 }], "2026-11-16", 10000);
    expect(r.difference).toBe(0);
  });
  it("ubalancerede poster afvises og tilbageførsel balancerer", () => {
    expect(isBalanced([{ account: "1000", debit: 100, credit: 0 }, { account: "4100", debit: 0, credit: 99 }])).toBe(false);
    const ok: Line[] = [{ account: "1000", debit: 100, credit: 0 }, { account: "4100", debit: 0, credit: 100 }];
    expect(isBalanced(reverseLines(ok))).toBe(true);
  });
});
