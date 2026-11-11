export interface StripeBalanceSnapshot {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
  connect_reserved?: { amount: number; currency: string }[];
  instant_available?: { amount: number; currency: string }[];
}

export interface StripeRecon { currency: string; available: number; pending: number; reserved: number; stripeTotal: number; book: number; difference: number }

/** Compare booked Stripe balance (per currency) with Stripe's available + pending + reserved. */
export function reconcileStripe(snap: StripeBalanceSnapshot, bookByCurrency: Record<string, number>): StripeRecon[] {
  const cur = new Set<string>([...Object.keys(bookByCurrency)]);
  const sum = (arr: { amount: number; currency: string }[] | undefined, c: string) =>
    (arr ?? []).filter((x) => x.currency.toLowerCase() === c).reduce((s, x) => s + x.amount, 0);
  for (const a of [...snap.available, ...snap.pending, ...(snap.connect_reserved ?? [])]) cur.add(a.currency.toLowerCase());
  return [...cur].map((c) => {
    const available = sum(snap.available, c);
    const pending = sum(snap.pending, c);
    const reserved = sum(snap.connect_reserved, c);
    const stripeTotal = available + pending + reserved;
    const book = bookByCurrency[c] ?? 0;
    return { currency: c, available, pending, reserved, stripeTotal, book, difference: book - stripeTotal };
  });
}

/** Booked bank balance at a statement date vs. the statement. */
export function reconcileBank(lines: { date: string; signed: number }[], statementDate: string, statementBalance: number) {
  const book = lines.filter((l) => l.date <= statementDate).reduce((s, l) => s + l.signed, 0);
  return { statementDate, book, statement: statementBalance, difference: book - statementBalance };
}
