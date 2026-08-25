export type SplitDriver = {
  entry_id: string;
  user_id: string;
  driver_name: string;
  score: number | null;
  percentile: number | null;
  hasRating: boolean;
};

export function sortSplitDrivers(drivers: SplitDriver[]): SplitDriver[] {
  return [...drivers].sort((a, b) => {
    if (a.hasRating !== b.hasRating) return a.hasRating ? -1 : 1;
    if ((a.score ?? -Infinity) !== (b.score ?? -Infinity)) {
      return (b.score ?? -Infinity) - (a.score ?? -Infinity);
    }
    if ((a.percentile ?? -Infinity) !== (b.percentile ?? -Infinity)) {
      return (b.percentile ?? -Infinity) - (a.percentile ?? -Infinity);
    }
    return a.driver_name.localeCompare(b.driver_name, "da");
  });
}

export function buildAutomaticSplit(drivers: SplitDriver[]): {
  proDrivers: SplitDriver[];
  amDrivers: SplitDriver[];
} {
  const sorted = sortSplitDrivers(drivers);
  const n = sorted.length;
  if (n < 2) return { proDrivers: sorted, amDrivers: [] };

  let bestK = Math.floor(n / 2);
  let bestTotal = -Infinity;
  const ratedGaps = sorted.slice(0, -1).map((driver, index) => {
    const next = sorted[index + 1];
    if (!driver.hasRating || !next?.hasRating || driver.score == null || next.score == null) return 0;
    return Math.max(0, driver.score - next.score);
  });
  const maxGap = Math.max(...ratedGaps, 0.001);

  for (let k = 1; k < n; k += 1) {
    const balance = 1 - Math.abs(k - n / 2) / (n / 2);
    const gap = (ratedGaps[k - 1] ?? 0) / maxGap;
    const total = 0.35 * balance + 0.65 * gap;
    if (total > bestTotal) {
      bestTotal = total;
      bestK = k;
    }
  }

  return {
    proDrivers: sorted.slice(0, bestK),
    amDrivers: sorted.slice(bestK),
  };
}

export function validateSplitAssignment(
  allEntryIds: string[],
  proEntryIds: string[],
  amEntryIds: string[],
): void {
  if (proEntryIds.length === 0 || amEntryIds.length === 0) {
    throw new Error("Både Pro og Am skal indeholde mindst én kører.");
  }
  const expected = new Set(allEntryIds);
  const assigned = [...proEntryIds, ...amEntryIds];
  const unique = new Set(assigned);
  if (unique.size !== assigned.length) throw new Error("En kører kan ikke være i både Pro og Am.");
  if (unique.size !== expected.size || assigned.some((id) => !expected.has(id))) {
    throw new Error("Fordelingen matcher ikke længere ligaens tilmeldinger. Åbn previewet igen.");
  }
}