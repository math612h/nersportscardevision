import { startOfWeek, format, addDays } from "date-fns";

/** Mandag i ugen som YYYY-MM-DD (lokal tid). */
export function getWeekStartISO(date: Date = new Date()): string {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  return format(monday, "yyyy-MM-dd");
}

export function getCurrentWeekStartISO(): string {
  return getWeekStartISO(new Date());
}

export function weekLabel(weekStartISO: string): string {
  const [y, m, d] = weekStartISO.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = addDays(start, 6);
  const weekNo = getISOWeek(start);
  return `Uge ${weekNo} · ${format(start, "d. MMM")}–${format(end, "d. MMM yyyy")}`;
}

function getISOWeek(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

export function shiftWeek(weekStartISO: string, deltaWeeks: number): string {
  const [y, m, d] = weekStartISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaWeeks * 7);
  return format(dt, "yyyy-MM-dd");
}

/** Trækker YouTube-video-id ud fra alle almindelige URL-formater. Returnerer null hvis ugyldigt. */
export function parseYouTubeId(input: string): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  // Ren id (11 tegn)
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "live" || p === "v");
      if (idx >= 0 && parts[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(parts[idx + 1])) return parts[idx + 1];
    }
  } catch {
    // ikke en gyldig URL
  }
  return null;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}

export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
