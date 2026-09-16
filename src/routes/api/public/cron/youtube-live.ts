import { createFileRoute } from "@tanstack/react-router";
import { fetchYoutubeLiveState } from "@/lib/youtube-live.server";
import { sendDiscordChannelMessage } from "@/lib/discord.server";

const BROADCAST_CHANNEL_ID = "1549648346463871046";
const MEMBERS_ROLE_ID = "1542536891486965962";
const CHANNEL_LIVE_URL =
  "https://www.youtube.com/channel/UCJUbwNmuLUXybJlUzJZbPjg/live";
const ANNOUNCE_WINDOW_MS = 10 * 60 * 60 * 1000; // 10 timer før start

function buildUpcomingMessage(
  title: string | null,
  videoId: string | null,
  startsAt: Date,
): string {
  const link = videoId ? `https://www.youtube.com/watch?v=${videoId}` : CHANNEL_LIVE_URL;
  const unix = Math.floor(startsAt.getTime() / 1000);
  const parts: string[] = [];
  parts.push(`<@&${MEMBERS_ROLE_ID}>`);
  parts.push("");
  parts.push("📡  **VI GÅR SNART LIVE PÅ YOUTUBE!**");
  parts.push("");
  if (title) parts.push(`📺 **${title}**`);
  parts.push(`🗓️ Starter <t:${unix}:F>`);
  parts.push(`⏳ Nedtælling: **<t:${unix}:R>**`);
  parts.push(`👉 ${link}`);
  parts.push("");
  parts.push("Sæt en påmindelse på YouTube — vi ses i chatten! 🏁");
  return parts.join("\n");
}

async function run() {
  const state = await fetchYoutubeLiveState();
  if (state.status === "unknown") {
    console.warn("[youtube-live] kunne ikke afgøre status:", state.error);
    return Response.json({ ok: true, skipped: true, reason: state.error });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("broadcast_live_state")
    .select("id, is_live, video_id, upcoming_announced_video_id")
    .eq("platform", "youtube")
    .maybeSingle();

  const wasLive = Boolean(row?.is_live);
  const announcedVideoId = (row as { upcoming_announced_video_id?: string | null } | null)
    ?.upcoming_announced_video_id ?? null;

  if (state.status === "offline") {
    if (wasLive) {
      await supabaseAdmin
        .from("broadcast_live_state")
        .update({
          is_live: false,
          video_id: null,
          title: null,
          started_at: null,
          upcoming_video_id: null,
          upcoming_title: null,
          scheduled_start_at: null,
        })
        .eq("platform", "youtube");
    } else {
      await supabaseAdmin
        .from("broadcast_live_state")
        .update({ upcoming_video_id: null, upcoming_title: null, scheduled_start_at: null })
        .eq("platform", "youtube");
    }
    return Response.json({ ok: true, live: false, upcoming: false, changed: wasLive });
  }

  if (state.status === "upcoming") {
    const startsAt = state.scheduledStart ? new Date(state.scheduledStart) : null;
    const now = Date.now();
    const shouldAnnounce =
      startsAt != null &&
      !Number.isNaN(startsAt.getTime()) &&
      startsAt.getTime() > now &&
      startsAt.getTime() - now <= ANNOUNCE_WINDOW_MS &&
      state.videoId != null &&
      state.videoId !== announcedVideoId;

    let discordMessageId: string | null = null;
    let announceSent = false;
    if (shouldAnnounce && startsAt) {
      try {
        const res = await sendDiscordChannelMessage(
          BROADCAST_CHANNEL_ID,
          buildUpcomingMessage(state.title, state.videoId, startsAt),
          [MEMBERS_ROLE_ID],
        );
        if (res.ok) {
          discordMessageId = res.messageId ?? null;
          announceSent = true;
        } else console.error("[youtube-live] Discord-fejl", res.status, res.message);
      } catch (e) {
        console.error("[youtube-live] Discord-fejl", e);
      }
    }

    await supabaseAdmin
      .from("broadcast_live_state")
      .update({
        is_live: false,
        video_id: null,
        started_at: null,
        upcoming_video_id: state.videoId,
        upcoming_title: state.title,
        scheduled_start_at: startsAt ? startsAt.toISOString() : null,
        // Markér kun som annonceret hvis Discord-beskeden faktisk gik igennem,
        // så næste cron-kørsel prøver igen ved fejl.
        ...(announceSent
          ? {
              upcoming_announced_video_id: state.videoId,
              upcoming_announced_at: new Date().toISOString(),
              upcoming_discord_message_id: discordMessageId,
            }
          : {}),
      })

      .eq("platform", "youtube");

    return Response.json({
      ok: true,
      live: false,
      upcoming: true,
      scheduledStart: startsAt ? startsAt.toISOString() : null,
      announced: announceSent,
    });
  }

  // Live: opdater kun status til live-bjælken — Discord-beskeden er allerede sendt 10 timer før.
  await supabaseAdmin
    .from("broadcast_live_state")
    .update({
      is_live: true,
      video_id: state.videoId,
      title: state.title,
      started_at: wasLive ? undefined : new Date().toISOString(),
      upcoming_video_id: null,
      upcoming_title: null,
      scheduled_start_at: null,
    })
    .eq("platform", "youtube");

  return Response.json({ ok: true, live: true, changed: !wasLive });
}

export const Route = createFileRoute("/api/public/cron/youtube-live")({
  server: {
    handlers: {
      POST: async () => run(),
      GET: async () => run(),
    },
  },
});
