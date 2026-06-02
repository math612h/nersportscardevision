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

  const track = text("RaceResults > TrackVenue") || text("TrackVenue") || text("TrackCourse");
  if (!track) throw new Error("Kunne ikke finde banens navn i filen");

  const layout = parseLayoutFromTrackData(text("RaceResults > TrackData") || text("TrackData"));

  let recordedAt: string | null = null;
  const ts = text("RaceResults > Race > DateTime") || text("RaceResults > DateTime");
  if (ts) {
    const n = Number(ts);
    if (Number.isFinite(n) && n > 0) recordedAt = new Date(n * 1000).toISOString();
  }

  const driverEls = Array.from(doc.querySelectorAll("RaceResults Race Driver"));
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
