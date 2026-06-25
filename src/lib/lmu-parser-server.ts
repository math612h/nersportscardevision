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

function cleanTrackName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\.mas$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(v|version)?\d+(\.\d+)+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTrackFromTrackData(trackData: unknown): string {
  if (trackData == null) return "";
  const parts = String(trackData).replace(/\\/g, "/").split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/^layout/i.test(part) || /^\d+(\.\d+)*$/.test(part)) continue;
    const cleaned = cleanTrackName(part);
    if (cleaned) return cleaned;
  }
  return "";
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
});

function normKey(key: string): string {
  return String(key).replace(/^.*:/, "").replace(/^@_/, "").toLowerCase();
}

function childValue(node: any, ...names: string[]): string {
  if (node == null) return "";
  if (typeof node !== "object") return String(node).trim();
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(node)) {
    if (!wanted.has(normKey(key))) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (first == null) return "";
    if (typeof first === "object") return String((first as Record<string, unknown>)["#text"] ?? "").trim();
    return String(first).trim();
  }
  return "";
}

function findRaceResultsNode(obj: any): any | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj)) {
    if (normKey(key) === "raceresults") return Array.isArray(value) ? value.at(-1) : value;
    for (const child of asArray(value as any)) {
      const found = findRaceResultsNode(child);
      if (found) return found;
    }
  }
  return null;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function directDrivers(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  const drivers: any[] = [];
  for (const [key, value] of Object.entries(node)) {
    const normalized = normKey(key);
    if (normalized === "driver") {
      drivers.push(...asArray(value as any).filter((driver) => driver && typeof driver === "object"));
    }
    if (normalized === "drivers") {
      for (const wrapper of asArray(value as any)) drivers.push(...directDrivers(wrapper));
    }
  }
  return drivers;
}

function sessionPriority(key: string): number {
  const k = key.toLowerCase();
  if (k.startsWith("race")) return 0;
  if (k.startsWith("qualify")) return 1;
  if (k.startsWith("practice")) return 2;
  if (k.startsWith("warmup")) return 3;
  if (k.startsWith("testday")) return 4;
  if (k.includes("session")) return 5;
  return 99;
}

function findSessionNode(rr: any): any | null {
  const candidates: Array<{ key: string; node: any; score: number }> = [];
  for (const [key, value] of Object.entries(rr ?? {})) {
    for (const node of asArray(value as any)) {
      if (!node || typeof node !== "object") continue;
      const score = sessionPriority(key);
      if (score < 99 || directDrivers(node).length) candidates.push({ key, node, score });
    }
  }
  const sortSessions = (a: { key: string; score: number }, b: { key: string; score: number }) =>
    a.score - b.score || b.key.localeCompare(a.key);
  const withDrivers = candidates.filter((c) => directDrivers(c.node).length).sort(sortSessions);
  if (withDrivers[0]) return withDrivers[0].node;
  return candidates.sort(sortSessions)[0]?.node ?? null;
}

function findDriversDeep(node: any, seen = new Set<any>()): any[] {
  if (!node || typeof node !== "object" || seen.has(node)) return [];
  seen.add(node);
  const drivers = directDrivers(node);
  if (drivers.length) return drivers;
  for (const value of Object.values(node)) {
    for (const child of asArray(value as any)) {
      const found = findDriversDeep(child, seen);
      if (found.length) return found;
    }
  }
  return [];
}

export function parseLmuRaceFileServer(xml: string): ParsedRace {
  let obj: any;
  try { obj = parser.parse(xml); } catch { throw new Error("Filen kunne ikke læses som XML"); }
  const rr = findRaceResultsNode(obj);
  if (!rr) throw new Error("Filen indeholder ikke RaceResults");

  const trackData = childValue(rr, "TrackData");
  const track = cleanTrackName(childValue(rr, "TrackVenue", "TrackCourse", "TrackEvent", "TrackName", "CircuitName")) || parseTrackFromTrackData(trackData);
  if (!track) throw new Error("Kunne ikke finde banens navn i filen");

  const layout = parseLayoutFromTrackData(trackData);
  const gameVersion = childValue(rr, "GameVersion") || null;

  const sessionNode = findSessionNode(rr);

  let recordedAt: string | null = null;
  const ts = childValue(sessionNode, "DateTime") || childValue(rr, "DateTime");
  if (ts != null) {
    const n = Number(ts);
    if (Number.isFinite(n) && n > 0) recordedAt = new Date(n * 1000).toISOString();
  }

  let driverArr: any[] = directDrivers(sessionNode);
  if (driverArr.length === 0) driverArr = findDriversDeep(rr);

  const drivers: ParsedDriver[] = driverArr.map((d): ParsedDriver => {
    const finishStatus = childValue(d, "FinishStatus");
    const blt = parseFloat(childValue(d, "BestLapTime"));
    let bestLapMs = Number.isFinite(blt) && blt > 0 ? Math.round(blt * 1000) : null;
    const lapValue = childValue(d, "Lap");
    if (bestLapMs == null && lapValue) {
      const laps = asArray((d.Lap ?? d.lap ?? lapValue) as any);
      const lapSeconds = laps
        .map((lap: unknown) => parseFloat(String(typeof lap === "object" && lap !== null ? (lap as Record<string, unknown>)["#text"] : lap)))
        .filter((n: number) => Number.isFinite(n) && n > 0);
      if (lapSeconds.length) bestLapMs = Math.round(Math.min(...lapSeconds) * 1000);
    }
    const fin = parseFloat(childValue(d, "FinishTime"));
    const carClass = childValue(d, "CarClass");
    const manufacturer = childValue(d, "Manufacturer");
    const carType = childValue(d, "CarType");
    const vehFile = childValue(d, "VehFile").replace(/\.veh$/i, "");
    let carModel: string | null = null;
    if (carType) carModel = manufacturer && !carType.toLowerCase().includes(manufacturer.toLowerCase()) ? `${manufacturer} ${carType}` : carType;
    else if (manufacturer) carModel = manufacturer;
    else if (vehFile) carModel = vehFile;
    const pos = parseInt(childValue(d, "Position"), 10);
    const laps = parseInt(childValue(d, "Laps") || childValue(d, "LapsCompleted"), 10);
    return {
      name: childValue(d, "Name"),
      carClass,
      carClassNorm: normalizeCarClass(carClass),
      carModel: carModel ? carModel.trim() || null : null,
      bestLapMs,
      finishMs: Number.isFinite(fin) && fin > 0 ? Math.round(fin * 1000) : null,
      finished: finishStatus.toLowerCase().startsWith("finished"),
      position: Number.isFinite(pos) && pos > 0 ? pos : null,
      laps: Number.isFinite(laps) && laps >= 0 ? laps : null,
    };
  });

  if (drivers.length === 0) throw new Error("Ingen kørere fundet i filen");
  return { track, layout, recordedAt, drivers };
}
