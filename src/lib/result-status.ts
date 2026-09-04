// Fælles status-logik for løbs- og kvalifikationsresultater.
//
// classified = gennemførte løbet
// ret        = udgik, men nåede mindst X% af klassevinderens omgange (får point)
// dnf        = udgik under X%-grænsen (ingen point)
// dns        = mødte ikke op / kørte 0 omgange
// nt         = kvalifikation: kørte omgange, men uden godkendt tid
// dsq        = diskvalificeret

export type ResultStatus = "classified" | "ret" | "dnf" | "dns" | "dsq" | "nt";

export const RESULT_STATUS_LABEL: Record<ResultStatus, string> = {
  classified: "",
  ret: "RET",
  dnf: "DNF",
  dns: "DNS",
  dsq: "DSQ",
  nt: "Ingen tid",
};

export function isResultStatus(v: unknown): v is ResultStatus {
  return typeof v === "string" && v in RESULT_STATUS_LABEL;
}

/** Antal omgange der kræves for at blive klassificeret. */
export function minLapsFor(maxLaps: number, minFinishPercent: number): number {
  if (!(minFinishPercent > 0) || !(maxLaps > 0)) return 0;
  return Math.ceil((maxLaps * minFinishPercent) / 100);
}

export function raceStatusFor(
  row: {
    dns?: boolean | null;
    dnf?: boolean | null;
    dsq?: boolean | null;
    laps?: number | null;
    finished?: boolean | null;
  },
  minLaps: number,
): ResultStatus {
  if (row.dsq) return "dsq";
  const laps = Number(row.laps ?? 0);
  if (row.dns) return "dns";
  if (!row.finished && laps <= 0) return "dns";
  if (row.finished) return "classified";
  // Udgået: over grænsen = RET (klassificeret), under = DNF
  if (minLaps > 0 && laps >= minLaps) return "ret";
  if (minLaps === 0 && laps > 0) return "ret";
  return "dnf";
}

export function qualiStatusFor(row: {
  dns?: boolean | null;
  nt?: boolean | null;
  best_lap_ms?: number | null;
  laps?: number | null;
}): ResultStatus {
  if (Number(row.best_lap_ms ?? 0) > 0) return "classified";
  if (row.nt) return "nt";
  if (row.dns) return "dns";
  return Number(row.laps ?? 0) > 0 ? "nt" : "dns";
}
