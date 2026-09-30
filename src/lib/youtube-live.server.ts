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

type ApiVideo = {
  id: string;
  snippet?: { title?: string; liveBroadcastContent?: string };
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };
};

/** Officiel YouTube Data API: uploads-playlisten + videos.list (2 enheder pr. kørsel). */
async function fetchViaApi(channelId: string, apiKey: string): Promise<YoutubeLiveResult> {
  const uploads = "UU" + channelId.slice(2);
  const plRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=15&playlistId=${uploads}&key=${apiKey}`,
  );
  if (!plRes.ok) return { status: "unknown", error: `API playlist ${plRes.status}: ${(await plRes.text()).slice(0, 200)}` };
  const pl = (await plRes.json()) as { items?: Array<{ contentDetails?: { videoId?: string } }> };
  const ids = (pl.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean) as string[];
  if (ids.length === 0) return { status: "offline" };
  const vRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${ids.join(",")}&key=${apiKey}`,
  );
  if (!vRes.ok) return { status: "unknown", error: `API videos ${vRes.status}: ${(await vRes.text()).slice(0, 200)}` };
  const vids = ((await vRes.json()) as { items?: ApiVideo[] }).items ?? [];
  const live = vids.find((v) => v.snippet?.liveBroadcastContent === "live");
  if (live) return { status: "live", videoId: live.id, title: live.snippet?.title ?? null };
  const now = Date.now();
  const upcoming = vids
    .filter((v) => v.snippet?.liveBroadcastContent === "upcoming" && v.liveStreamingDetails?.scheduledStartTime)
    // Ignorér gamle, glemte planlagte streams.
    .filter((v) => new Date(v.liveStreamingDetails!.scheduledStartTime!).getTime() > now - 6 * 3600_000)
    .sort(
      (a, b) =>
        new Date(a.liveStreamingDetails!.scheduledStartTime!).getTime() -
        new Date(b.liveStreamingDetails!.scheduledStartTime!).getTime(),
    )[0];
  if (upcoming) {
    return {
      status: "upcoming",
      videoId: upcoming.id,
      title: upcoming.snippet?.title ?? null,
      scheduledStart: new Date(upcoming.liveStreamingDetails!.scheduledStartTime!).toISOString(),
    };
  }
  return { status: "offline" };
}

export async function fetchYoutubeLiveState(
  channelId: string = YOUTUBE_CHANNEL_ID,
): Promise<YoutubeLiveResult> {
  const apiKey = process.env["YOUTUBE_API_KEY"];
  if (apiKey) {
    try {
      const r = await fetchViaApi(channelId, apiKey);
      if (r.status !== "unknown") return r;
      console.warn("[youtube-live] API fejlede, prøver websiden:", r.error);
    } catch (e) {
      console.warn("[youtube-live] API fejlede, prøver websiden:", (e as Error).message);
    }
  }
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
  excludeVideoId: string | null = null,
  channelId: string = YOUTUBE_CHANNEL_ID,
): Promise<{ videoId: string; title: string | null } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/streams`, {
      headers: { "User-Agent": UA, "Accept-Language": "da,en;q=0.8", Accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const starts: number[] = [];
    const re = /"richItemRenderer"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) starts.push(m.index);
    for (let i = 0; i < starts.length; i++) {
      const chunk = html.slice(starts[i], starts[i + 1] ?? starts[i] + 15000);
      const videoId = chunk.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/)?.[1];
      if (!videoId) continue;
      // Spring planlagte og igangværende streams over.
      if (/upcomingEventData|"Upcoming"|UPCOMING|BADGE_STYLE_TYPE_LIVE_NOW|"LIVE"|"Kommende"|"Live nu"|"LIVE NU"/.test(chunk)) continue;
      if (excludeVideoId && videoId === excludeVideoId) continue;
      const title =
        chunk.match(/"title"\s*:\s*\{\s*"content"\s*:\s*"([^"]+)"/)?.[1] ??
        chunk.match(/"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/)?.[1] ??
        null;
      return { videoId, title: title ? title.replace(/\\u0026/g, "&") : null };
    }
    return null;
  } catch {
    return null;
  }
}
