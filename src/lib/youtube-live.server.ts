// Server-only: finder ud af om LMU Danmarks YouTube-kanal er live lige nu.
// Bruger ingen API-nøgle — henter kanalens /live-side og læser den indlejrede data.

export const YOUTUBE_CHANNEL_ID = "UCJUbwNmuLUXybJlUzJZbPjg";

export type YoutubeLiveResult =
  | { status: "live"; videoId: string | null; title: string | null }
  | {
      status: "upcoming";
      videoId: string | null;
      title: string | null;
      scheduledStart: string | null;
    }
  | { status: "offline" }
  | { status: "unknown"; error: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m && m[1] ? m[1] : null;
}

export async function fetchYoutubeLiveState(
  channelId: string = YOUTUBE_CHANNEL_ID,
): Promise<YoutubeLiveResult> {
  const url = `https://www.youtube.com/channel/${channelId}/live`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "da,en;q=0.8",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) return { status: "unknown", error: `HTTP ${res.status}` };
    html = await res.text();
  } catch (e) {
    return { status: "unknown", error: (e as Error).message };
  }

  if (!html || html.length < 1000) {
    return { status: "unknown", error: "Tomt svar fra YouTube" };
  }

  // Live-signaler i den indlejrede player-data.
  const isUpcoming =
    /"isUpcoming"\s*:\s*true/.test(html) ||
    /"liveBroadcastContent"\s*:\s*"upcoming"/.test(html);

  const isLive =
    !isUpcoming &&
    (/"isLiveNow"\s*:\s*true/.test(html) ||
      /"isLive"\s*:\s*true/.test(html) ||
      /<meta itemprop="isLiveBroadcast" content="True">/i.test(html));

  if (!isLive && !isUpcoming) return { status: "offline" };

  const videoId =
    firstMatch(html, /"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/) ??
    firstMatch(html, /watch\?v=([A-Za-z0-9_-]{11})/);

  let title =
    firstMatch(html, /<meta name="title" content="([^"]+)"/) ??
    firstMatch(html, /"title"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /<title>([^<]+)<\/title>/);

  if (title) {
    title = title
      .replace(/\s*-\s*YouTube\s*$/i, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\\u0026/g, "&")
      .trim();
  }

  if (isUpcoming) {
    // Planlagt starttidspunkt: enten epoch-sekunder eller ISO-dato.
    const epoch = firstMatch(html, /"scheduledStartTime"\s*:\s*"?(\d{10,13})"?/);
    const iso =
      firstMatch(html, /<meta itemprop="startDate" content="([^"]+)"/) ??
      firstMatch(html, /"startTime"\s*:\s*"([0-9T:\-+.Z]{10,})"/);
    let scheduledStart: string | null = null;
    if (epoch) {
      const n = Number(epoch);
      const ms = epoch.length > 10 ? n : n * 1000;
      if (Number.isFinite(ms)) scheduledStart = new Date(ms).toISOString();
    } else if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) scheduledStart = d.toISOString();
    }
    return { status: "upcoming", videoId, title: title || null, scheduledStart };
  }

  return { status: "live", videoId, title: title || null };
}

/** Seneste (afsluttede) livestream fra kanalens /streams-side. */
export async function fetchLatestYoutubeStream(
  channelId: string = YOUTUBE_CHANNEL_ID,
): Promise<{ videoId: string; title: string | null } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/streams`, {
      headers: { "User-Agent": UA, "Accept-Language": "da,en;q=0.8", Accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const re = /"videoRenderer"\s*:\s*\{\s*"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"([\s\S]{0,3000}?)"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const chunk = html.slice(m.index, m.index + 6000);
      if (/upcomingEventData|BADGE_STYLE_TYPE_LIVE_NOW/.test(chunk.slice(0, 4000))) continue;
      return { videoId: m[1], title: m[3].replace(/\\u0026/g, "&") };
    }
    return null;
  } catch {
    return null;
  }
}
