// Worker-safe variant of parseLmuRaceFile — uses fast-xml-parser instead of DOMParser
// so it runs in the Cloudflare Worker runtime that powers the public upload endpoint.
import { XMLParser } from "fast-xml-parser";
import { normalizeCarClass, type ParsedRace, type ParsedDriver } from "./lmu-parser";

function parseLayoutFromTrackData(trackData: unknown): string | null {
  if (trackData == null) return null;
  const m = String(trackData).match(/layout([A-Za-z0-9_-]+)\.mas/i);
  if (!m) return null;
  return m[1].replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim() || null;
}

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true, parseTagValue: false });

function findRaceResultsNode(obj: any): any | null {
  if (!obj || typeof obj !== "object") return null;
  if (obj.RaceResults) return Array.isArray(obj.RaceResults) ? obj.RaceResults.at(-1) : obj.RaceResults;
  if (obj.rFactorXML?.RaceResults) {
    return Array.isArray(obj.rFactorXML.RaceResults) ? obj.rFactorXML.RaceResults.at(-1) : obj.rFactorXML.RaceResults;
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object" && (value as any).RaceResults) {
      const raceResults = (value as any).RaceResults;
      return Array.isArray(raceResults) ? raceResults.at(-1) : raceResults;
    }
  }
  return null;
}

export function parseLmuRaceFileServer(xml: string): ParsedRace {
  let obj: any;
  try { obj = parser.parse(xml); } catch { throw new Error("Filen kunne ikke læses som XML"); }
  const rr = findRaceResultsNode(obj);
  if (!rr) throw new Error("Filen indeholder ikke RaceResults");

  const track = String(rr.TrackVenue ?? rr.TrackCourse ?? "").trim();
  if (!track) throw new Error("Kunne ikke finde banens navn i filen");

  const layout = parseLayoutFromTrackData(rr.TrackData);

  let recordedAt: string | null = null;
  const ts = rr?.Race?.DateTime ?? rr?.DateTime;
  if (ts != null) {
    const n = Number(ts);
    if (Number.isFinite(n) && n > 0) recordedAt = new Date(n * 1000).toISOString();
  }

  const race = rr.Race;
  let driverArr: any[] = [];
  if (race?.Driver) driverArr = Array.isArray(race.Driver) ? race.Driver : [race.Driver];

  const drivers: ParsedDriver[] = driverArr.map((d): ParsedDriver => {
    const finishStatus = String(d.FinishStatus ?? "");
    const blt = parseFloat(String(d.BestLapTime ?? ""));
    const fin = parseFloat(String(d.FinishTime ?? ""));
    const carClass = String(d.CarClass ?? "");
    const manufacturer = String(d.Manufacturer ?? "");
    const carType = String(d.CarType ?? "");
    const vehFile = String(d.VehFile ?? "").replace(/\.veh$/i, "");
    let carModel: string | null = null;
    if (carType) carModel = manufacturer && !carType.toLowerCase().includes(manufacturer.toLowerCase()) ? `${manufacturer} ${carType}` : carType;
    else if (manufacturer) carModel = manufacturer;
    else if (vehFile) carModel = vehFile;
    return {
      name: String(d.Name ?? ""),
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
