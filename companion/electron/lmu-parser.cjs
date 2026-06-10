// LMU result file parser — Node.js port of src/lib/lmu-parser.ts.
// Uses fast-xml-parser since DOMParser isn't available in Node main process.
const { XMLParser } = require("fast-xml-parser");

const CLASS_NORMALIZATION = {
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

function normalizeCarClass(raw) {
  const key = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
  return CLASS_NORMALIZATION[key] ?? String(raw || "").trim();
}

function parseLayoutFromTrackData(trackData) {
  if (!trackData) return null;
  const m = String(trackData).match(/layout([A-Za-z0-9_-]+)\.mas/i);
  if (!m) return null;
  let layout = m[1];
  layout = layout.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return layout || null;
}

function cleanTrackName(raw) {
  return String(raw || "")
    .replace(/\.mas$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(v|version)?\d+(\.\d+)+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTrackFromTrackData(trackData) {
  if (!trackData) return "";
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
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
});

function findRaceResultsNode(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.RaceResults) return Array.isArray(obj.RaceResults) ? obj.RaceResults.at(-1) : obj.RaceResults;
  if (obj.rFactorXML?.RaceResults) {
    return Array.isArray(obj.rFactorXML.RaceResults) ? obj.rFactorXML.RaceResults.at(-1) : obj.rFactorXML.RaceResults;
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object" && value.RaceResults) {
      return Array.isArray(value.RaceResults) ? value.RaceResults.at(-1) : value.RaceResults;
    }
  }
  return null;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function directDrivers(node) {
  if (!node || typeof node !== "object") return [];
  return asArray(node.Driver).filter((driver) => driver && typeof driver === "object");
}

function sessionPriority(key) {
  const k = String(key || "").toLowerCase();
  if (k.startsWith("race")) return 0;
  if (k.startsWith("qualify")) return 1;
  if (k.startsWith("practice")) return 2;
  if (k.startsWith("warmup")) return 3;
  if (k.startsWith("testday")) return 4;
  if (k.includes("session")) return 5;
  return 99;
}

function findSessionNode(rr) {
  const candidates = [];
  for (const [key, value] of Object.entries(rr || {})) {
    for (const node of asArray(value)) {
      if (!node || typeof node !== "object") continue;
      const score = sessionPriority(key);
      if (score < 99 || directDrivers(node).length) candidates.push({ key, node, score });
    }
  }
  const sortSessions = (a, b) => a.score - b.score || String(b.key).localeCompare(String(a.key));
  const withDrivers = candidates.filter((c) => directDrivers(c.node).length).sort(sortSessions);
  if (withDrivers[0]) return withDrivers[0].node;
  return candidates.sort(sortSessions)[0]?.node || null;
}

function findDriversDeep(node, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return [];
  seen.add(node);
  const drivers = directDrivers(node);
  if (drivers.length) return drivers;
  for (const value of Object.values(node)) {
    for (const child of asArray(value)) {
      const found = findDriversDeep(child, seen);
      if (found.length) return found;
    }
  }
  return [];
}

function parseLmuRaceFile(xml) {
  const doc = parser.parse(xml);
  const rr = findRaceResultsNode(doc);
  if (!rr) throw new Error("Not an LMU race result file (missing RaceResults)");

  const track = cleanTrackName(rr.TrackVenue || rr.TrackCourse || rr.TrackEvent || rr.TrackName || rr.CircuitName) || parseTrackFromTrackData(rr.TrackData);
  if (!track) throw new Error("Missing TrackVenue");

  const layout = parseLayoutFromTrackData(rr.TrackData);

  const race = findSessionNode(rr);
  if (!race) throw new Error("Missing session node (Race/Qualify/Practice)");

  let recordedAt = null;
  const ts = race.DateTime || rr.DateTime;
  if (ts) {
    const n = Number(ts);
    if (Number.isFinite(n) && n > 0) recordedAt = new Date(n * 1000).toISOString();
  }

  let driverEls = directDrivers(race);
  if (!driverEls.length) driverEls = findDriversDeep(rr);

  const drivers = driverEls.map((el) => {
    const finishStatus = String(el.FinishStatus || "");
    const blt = parseFloat(el.BestLapTime);
    let bestLapMs = Number.isFinite(blt) && blt > 0 ? Math.round(blt * 1000) : null;
    if (bestLapMs == null && el.Lap) {
      const laps = Array.isArray(el.Lap) ? el.Lap : [el.Lap];
      const lapSeconds = laps.map((lap) => parseFloat(typeof lap === "object" ? lap["#text"] : lap)).filter((n) => Number.isFinite(n) && n > 0);
      if (lapSeconds.length) bestLapMs = Math.round(Math.min(...lapSeconds) * 1000);
    }
    const fin = parseFloat(el.FinishTime);
    const carClass = String(el.CarClass || "");
    const manufacturer = String(el.Manufacturer || "");
    const carType = String(el.CarType || "");
    const vehFile = String(el.VehFile || "").replace(/\.veh$/i, "");
    let carModel = null;
    if (carType) {
      carModel = manufacturer && !carType.toLowerCase().includes(manufacturer.toLowerCase())
        ? `${manufacturer} ${carType}`
        : carType;
    } else if (manufacturer) carModel = manufacturer;
    else if (vehFile) carModel = vehFile;
    return {
      name: String(el.Name || "").trim(),
      carClass,
      carClassNorm: normalizeCarClass(carClass),
      carModel: carModel ? carModel.trim() || null : null,
      bestLapMs,
      finishMs: Number.isFinite(fin) && fin > 0 ? Math.round(fin * 1000) : null,
      finished: finishStatus.toLowerCase().startsWith("finished"),
    };
  });

  if (drivers.length === 0) throw new Error("Ingen kørere fundet i filen");
  return { track, layout, recordedAt, drivers };
}

function nameSimilarity(a, b) {
  const aa = String(a || "").trim().toLowerCase().replace(/\s+/g, " ");
  const bb = String(b || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  // Levenshtein
  const m = aa.length, n = bb.length;
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let cur = i, prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      const cost = aa.charCodeAt(i - 1) === bb.charCodeAt(j - 1) ? 0 : 1;
      cur = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prev[j - 1] = cur;
      prevDiag = tmp;
    }
    prev[n] = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

module.exports = { parseLmuRaceFile, normalizeCarClass, nameSimilarity };
