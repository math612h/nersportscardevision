export interface Claim { id: string; claimant_id: string; amount_minor: number; status: "submitted" | "approved" | "rejected"; is_opening?: boolean }
export interface Repayment { claimant_id: string; amount_minor: number; paid_on: string }

/** Debt = approved claims (incl. approved opening balance) minus confirmed repayments after cutoff. */
export function outstandingDebt(claims: Claim[], repayments: Repayment[], claimantId: string, cutoff: string | null): number {
  const owed = claims.filter((c) => c.claimant_id === claimantId && c.status === "approved").reduce((s, c) => s + c.amount_minor, 0);
  const paid = repayments
    .filter((r) => r.claimant_id === claimantId && (!cutoff || r.paid_on >= cutoff))
    .reduce((s, r) => s + r.amount_minor, 0);
  return owed - paid;
}

export function validateRepayment(amount: number, outstanding: number): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return "Beløbet skal være positivt";
  if (amount > outstanding) return "Tilbagebetalingen er større end restgælden";
  return null;
}

export function canApprove(claim: Claim, approverId: string): string | null {
  if (claim.claimant_id === approverId) return "Man kan ikke godkende sit eget udlæg";
  if (claim.status !== "submitted") return "Udlægget er allerede behandlet";
  return null;
}
