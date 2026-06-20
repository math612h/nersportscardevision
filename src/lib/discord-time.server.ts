// Server-only time helpers for Discord interactions.

function cphOffsetMinutes(at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Copenhagen",
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+01:00";
  const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(tz);
  if (!m) return 60;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || "0", 10));
}

function cphTodayParts(at: Date = new Date()): { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  return { y: get("year"), mo: get("month"), d: get("day") };
}

/**
 * Parse an "HH:MM" string as today's time in Europe/Copenhagen, return unix seconds.
 * Returns null if the format is invalid.
 */
export function parseCphHHMMToUnix(input: string): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(input.trim());
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh > 23 || mm > 59) return null;
  const { y, mo, d } = cphTodayParts();
  const offMin = cphOffsetMinutes();
  const sign = offMin >= 0 ? "+" : "-";
  const oh = Math.floor(Math.abs(offMin) / 60).toString().padStart(2, "0");
  const om = (Math.abs(offMin) % 60).toString().padStart(2, "0");
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${sign}${oh}:${om}`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}
