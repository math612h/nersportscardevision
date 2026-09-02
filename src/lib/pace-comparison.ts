// Sammenligning af LMGT3-kørernes løbstempo på tværs af to racefiler
// (PRO-serveren med LMGT3 Pro + LMP2, og AM-serveren med LMGT3 Am).
//
// Ren logik uden UI: beregner medianen af ALLE gyldige omgange pr. kører
// og sorterer alle kørere i én samlet liste.

import type { ParsedDriver, ParsedRace } from "./lmu-parser";

export type PaceSource = "pro" | "am";

export type PaceLap = { num: number | null; ms: number };

export type PaceRow = {
  key: string;
  name: string;
  carNumber: string | null;
  carModel: string | null;
  source: PaceSource;
  fileName: string;
  /** Alle gyldige omgange sorteret hurtigste → langsomste. */
  validLaps: PaceLap[];
  validLapCount: number;
  fastestLapMs: number | null;
  /** Alle gyldige omgange (bruges til udfoldning i UI). */
  topLaps: PaceLap[];
  /** Median af alle gyldige omgange — null hvis der slet ingen gyldige omgange er. */
  medianMs: number | null;
  /** Sand når køreren slet ikke har gyldige omgange. */
  insufficient: boolean;
  /** Placering i den samlede rangering; null når datagrundlaget er utilstrækkeligt. */
  position: number | null;
  /** Forskel i ms til den hurtigste median; null for den hurtigste/uden median. */
  gapMs: number | null;
};

/** Median af N tider = gennemsnittet af de to midterste (ved lige antal). */
export function medianOf(sortedMs: number[]): number | null {
  if (sortedMs.length === 0) return null;
  const mid = sortedMs.length / 2;
  if (Number.isInteger(mid)) return (sortedMs[mid - 1] + sortedMs[mid]) / 2;
  return sortedMs[Math.floor(mid)];
}

/**
 * Fordeler en bils gyldige omgange på de faktiske kørere ud fra <Swap>-intervaller.
 * Uden swaps returneres bilens egen kører med alle omgange.
 */
function splitDriverLaps(d: ParsedDriver): { name: string; laps: PaceLap[] }[] {
  const laps = (d.validLaps ?? []) as PaceLap[];
  const swaps = (d.swaps ?? []).filter(
    (s) => s.name?.trim() && s.startLap != null && s.endLap != null && s.startLap >= 1 && s.endLap >= s.startLap,
  );
  if (swaps.length === 0) return [{ name: d.name, laps }];

  const byName = new Map<string, PaceLap[]>();
  for (const lap of laps) {
    if (lap.num == null) continue;
    const swap = swaps.find((s) => lap.num! >= (s.startLap as number) && lap.num! <= (s.endLap as number));
    if (!swap) continue;
    const key = swap.name.trim();
    const arr = byName.get(key);
    if (arr) arr.push(lap);
    else byName.set(key, [lap]);
  }
  if (byName.size === 0) return [{ name: d.name, laps }];
  return [...byName.entries()].map(([name, l]) => ({ name, laps: l }));
}

export type PaceFile = {
  source: PaceSource;
  fileName: string;
  race: ParsedRace;
};

/**
 * Bygger den samlede resultatliste. Kun LMGT3-kørere medtages —
 * LMP2 og alle andre klasser ignoreres helt.
 */
export function buildPaceComparison(files: PaceFile[]): PaceRow[] {
  const rows: PaceRow[] = [];

  for (const file of files) {
    for (const d of file.race.drivers) {
      if ((d.carClassNorm || "").toUpperCase() !== "LMGT3") continue;
      for (const part of splitDriverLaps(d)) {
        const sorted = [...part.laps].sort((a, b) => a.ms - b.ms);
        const topLaps = sorted.slice(0, TOP_LAPS);
        const insufficient = sorted.length < TOP_LAPS;
        rows.push({
          key: `${file.source}:${part.name}:${d.carNumber ?? ""}`,
          name: part.name,
          carNumber: d.carNumber ?? null,
          carModel: d.carModel ?? null,
          source: file.source,
          fileName: file.fileName,
          validLaps: sorted,
          validLapCount: sorted.length,
          fastestLapMs: sorted[0]?.ms ?? null,
          topLaps: insufficient ? sorted : topLaps,
          medianMs: insufficient ? null : medianOf(topLaps.map((l) => l.ms)),
          insufficient,
          position: null,
          gapMs: null,
        });
      }
    }
  }

  const ranked = rows.filter((r) => !r.insufficient).sort((a, b) => (a.medianMs as number) - (b.medianMs as number));
  const rest = rows
    .filter((r) => r.insufficient)
    .sort((a, b) => b.validLapCount - a.validLapCount || (a.fastestLapMs ?? Infinity) - (b.fastestLapMs ?? Infinity));

  const best = ranked[0]?.medianMs ?? null;
  ranked.forEach((r, i) => {
    r.position = i + 1;
    r.gapMs = best == null ? null : (r.medianMs as number) - best;
  });

  return [...ranked, ...rest];
}

export function msToLapStr(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const mm = Math.floor(total / 60_000);
  const rest = total - mm * 60_000;
  const ss = Math.floor(rest / 1000);
  const mss = rest - ss * 1000;
  return `${mm}:${String(ss).padStart(2, "0")}.${String(mss).padStart(3, "0")}`;
}

export function gapToStr(ms: number): string {
  const sign = ms < 0 ? "-" : "+";
  return `${sign}${(Math.abs(ms) / 1000).toFixed(3)}`;
}
