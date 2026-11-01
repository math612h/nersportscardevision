// Fælles drop-runde-regel: de `dropRounds` laveste afdelinger streges og
// tæller ikke i totalen — kun når der er kørt flere afdelinger end antallet.
// Bruges af hjemmesidens stillinger og Discord-stillingerne.
export function droppedRoundIds(
  roundNets: Record<string, number>,
  dropRounds: number,
  completedCount: number,
): Set<string> {
  if (!(dropRounds > 0) || completedCount <= dropRounds) return new Set();
  return new Set(
    Object.entries(roundNets)
      .sort((a, b) => a[1] - b[1])
      .slice(0, dropRounds)
      .map(([id]) => id),
  );
}

export function totalAfterDrop(
  roundNets: Record<string, number>,
  dropRounds: number,
  completedCount: number,
): number {
  const dropped = droppedRoundIds(roundNets, dropRounds, completedCount);
  return Object.entries(roundNets).reduce((s, [id, n]) => (dropped.has(id) ? s : s + n), 0);
}
