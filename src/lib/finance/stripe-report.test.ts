import { describe, expect, it } from "vitest";
import { approvedCutoffUnix, endingBalanceFromCsv } from "./stripe-report";
import { formatDkk } from "./ledger";

const csv = `category,description,currency,net_amount
starting_balance,Starting balance,dkk,0.00
ending_balance,Ending balance,usd,5.00
ending_balance,Ending balance,dkk,1374.74
`;

describe("Stripe-saldo ved skæringspunkt", () => {
  it("viser ending_balance/dkk net_amount 1374.74 som 1.374,74 kr.", () => {
    expect(formatDkk(endingBalanceFromCsv(csv))).toBe("1.374,74 kr.");
  });
  it("fejler uden ending_balance-række i DKK", () => {
    expect(() => endingBalanceFromCsv("category,currency,net_amount\nending_balance,usd,1.00\n")).toThrow();
  });
  it("fejler på ulæselig CSV", () => {
    expect(() => endingBalanceFromCsv("<html>nope</html>")).toThrow();
  });
  it("afviser ikke-godkendt skæringspunkt", () => {
    expect(() => approvedCutoffUnix({ cutoff_at: "2026-11-09T23:00:00Z", cutoff_approved_at: null })).toThrow();
    expect(approvedCutoffUnix({ cutoff_at: "2026-11-09T23:00:00Z", cutoff_approved_at: "x" })).toBe(1794265200);
  });
});
