// Shared parser for Le Mans Ultimate XML race result files.
// Used by both the admin "import official result" flow and the user
// "upload your own race" flow on the leaderboard.

export type ParsedDriver = {
  name: string;
  carClass: string;
  carClassNorm: string; // normalized display class (Hypercar / LMGT3 / LMP2 / LMP3 / GT-E)
  carModel: string | null; // specific vehicle, e.g. "Ferrari 499P"
  bestLapMs: number | null;
  finishMs: number | null;
  finished: boolean;
};

export type ParsedRace = {
  track: string;
  layout: string | null;
  recordedAt: string | null; // ISO
  drivers: ParsedDriver[];
};

const CLASS_NORMALIZATION: Record<string, string> = {
  hyper: "Hypercar",
  hypercar: "Hypercar",
  lmh: "Hypercar",
  lmdh: "Hypercar",
  gt3: "LMGT3",
  lmgt3: "LMGT3",
  gte: "GT-E",
  "gt-e": "GT-E",
  lmp2: "LMP2",
  lmp3: "LMP3",
};

export function normalizeCarClass(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  return CLASS_NORMALIZATION[key] ?? raw.trim();
}

export const CAR_CLASS_OPTIONS = ["Hypercar", "LMGT3", "GT-E", "LMP2", "LMP3"] as const;

function parseLayoutFromTrackData(trackData: string | null | undefined): string | null {
  if (!trackData) return null;
  // Examples seen: ".../Barcelona_2025/1.03/layoutELMS.mas" → "ELMS"
  // ".../Spa/1.00/layoutGrandPrix.mas" → "Grand Prix"
  const m = trackData.match(/layout([A-Za-z0-9_-]+)\.mas/i);
  if (!m) return null;
  let layout = m[1];
  // Insert space between camelCase: GrandPrix → Grand Prix
  layout = layout.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return layout || null;
}

export function parseLmuRaceFile(xml: string): ParsedRace {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Filen kunne ikke læses som XML");
  }

  const text = (sel: string) => doc.querySelector(sel)?.textContent?.trim() ?? "";

  const raceResults = doc.querySelector("RaceResults");
  if (!raceResults) throw new Error("Filen indeholder ikke RaceResults");
  const childText = (sel: string) => raceResults.querySelector(`:scope > ${sel}`)?.textContent?.trim() ?? "";

  const track = childText("TrackVenue") || childText("TrackCourse") || text("TrackVenue") || text("TrackCourse");
  if (!track) throw new Error("Kunne ikke finde banens navn i filen");

  const layout = parseLayoutFromTrackData(childText("TrackData") || text("TrackData"));

  let recordedAt: string | null = null;
  const ts = raceResults.querySelector(":scope > Race > DateTime")?.textContent?.trim() || childText("DateTime");
  if (ts) {
    const n = Number(ts);
    if (Number.isFinite(n) && n > 0) recordedAt = new Date(n * 1000).toISOString();
  }

  const sessionNode = raceResults.querySelector(":scope > Race, :scope > Qualify, :scope > Practice, :scope > TestDay, :scope > WarmUp");
  const driverEls = sessionNode ? Array.from(sessionNode.querySelectorAll(":scope > Driver")) : [];
  const drivers: ParsedDriver[] = driverEls.map((el) => {
    const get = (t: string) => el.querySelector(`:scope > ${t}`)?.textContent?.trim() ?? "";
    const finishStatus = get("FinishStatus");
    const blt = parseFloat(get("BestLapTime"));
    const fin = parseFloat(get("FinishTime"));
    const carClass = get("CarClass");
    const manufacturer = get("Manufacturer");
    const carType = get("CarType");
    const vehFile = get("VehFile").replace(/\.veh$/i, "");
    let carModel: string | null = null;
    if (carType) carModel = manufacturer && !carType.toLowerCase().includes(manufacturer.toLowerCase()) ? `${manufacturer} ${carType}` : carType;
    else if (manufacturer) carModel = manufacturer;
    else if (vehFile) carModel = vehFile;
    return {
      name: get("Name"),
      carClass,
      carClassNorm: normalizeCarClass(carClass),
      carModel: carModel ? carModel.trim() || null : null,
      bestLapMs: Number.isFinite(blt) && blt > 0 ? Math.round(blt * 1000) : null,
      finishMs: Number.isFinite(fin) && fin > 0 ? Math.round(fin * 1000) : null,
      finished: finishStatus.toLowerCase().startsWith("finished"),
    };
  });

  if (drivers.length === 0) throw new Error("Ingen kørere fundet i filen");

  return { track, layout, recordedAt, drivers };
}

export function msToLapStr(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const mm = Math.floor(total / 60_000);
  const rest = total - mm * 60_000;
  const ss = Math.floor(rest / 1000);
  const mss = rest - ss * 1000;
  return `${mm}:${String(ss).padStart(2, "0")}.${String(mss).padStart(3, "0")}`;
}

// --- Fuzzy driver name matching ---------------------------------------------
// Levenshtein distance between two strings.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let cur = i;
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prev[j - 1] = cur;
      prevDiag = tmp;
    }
    prev[b.length] = cur;
  }
  return prev[b.length];
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Returns similarity ratio 0..1 between two driver names.
export function nameSimilarity(a: string, b: string): number {
  const aa = normalizeName(a);
  const bb = normalizeName(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  const maxLen = Math.max(aa.length, bb.length);
  return 1 - levenshtein(aa, bb) / maxLen;
}

// Finds the best matching candidate for `name` among `candidates`, if any
// pair scores at or above `threshold` (default 0.85 — i.e. ≥85% similar).
export function findBestNameMatch<T>(
  name: string,
  candidates: T[],
  getName: (c: T) => string | null | undefined,
  threshold = 0.85,
): { match: T; score: number } | null {
  let best: { match: T; score: number } | null = null;
  for (const c of candidates) {
    const cn = getName(c);
    if (!cn) continue;
    const score = nameSimilarity(name, cn);
    if (score >= threshold && (!best || score > best.score)) best = { match: c, score };
  }
  return best;
}
