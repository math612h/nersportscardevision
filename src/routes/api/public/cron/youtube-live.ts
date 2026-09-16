import { createFileRoute } from "@tanstack/react-router";
import { fetchYoutubeLiveState } from "@/lib/youtube-live.server";
import { sendDiscordChannelMessage } from "@/lib/discord.server";

const BROADCAST_CHANNEL_ID = "1549648346463871046";
const MEMBERS_ROLE_ID = "1542536891486965962";

function buildMessage(title: string | null, videoId: string | null): string {
  const link = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : "https://www.youtube.com/channel/UCJUbwNmuLUXybJlUzJZbPjg/live";
  const parts: string[] = [];
  parts.push(`<@&${MEMBERS_ROLE_ID}>`);
  parts.push("");
  parts.push("🔴🔴🔴  **VI ER LIVE PÅ YOUTUBE!**  🔴🔴🔴");
  parts.push("");
  if (title) parts.push(`📺 **${title}**`);
  parts.push(`👉 ${link}`);
  parts.push("");
  parts.push("Kom ind og se med — vi ses i chatten! 🏁");
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
    .select("id, is_live, video_id")
    .eq("platform", "youtube")
    .maybeSingle();

  const wasLive = Boolean(row?.is_live);
  const previousVideo = row?.video_id ?? null;

  if (state.status === "offline") {
    if (wasLive) {
      await supabaseAdmin
        .from("broadcast_live_state")
        .update({ is_live: false, video_id: null, title: null, started_at: null })
        .eq("platform", "youtube");
    }
    return Response.json({ ok: true, live: false, changed: wasLive });
  }

  const isNewStream = !wasLive || (state.videoId != null && state.videoId !== previousVideo);

  if (!isNewStream) {
    return Response.json({ ok: true, live: true, changed: false });
  }

  let discordMessageId: string | null = null;
  try {
    const res = await sendDiscordChannelMessage(
      BROADCAST_CHANNEL_ID,
      buildMessage(state.title, state.videoId),
      [MEMBERS_ROLE_ID],
    );
    if (res.ok) discordMessageId = res.messageId ?? null;
    else console.error("[youtube-live] Discord-fejl", res.status, res.message);
  } catch (e) {
    console.error("[youtube-live] Discord-fejl", e);
  }

  await supabaseAdmin
    .from("broadcast_live_state")
    .update({
      is_live: true,
      video_id: state.videoId,
      title: state.title,
      started_at: new Date().toISOString(),
      announced_at: new Date().toISOString(),
      discord_message_id: discordMessageId,
    })
    .eq("platform", "youtube");

  return Response.json({ ok: true, live: true, changed: true, announced: Boolean(discordMessageId) });
}

export const Route = createFileRoute("/api/public/cron/youtube-live")({
  server: {
    handlers: {
      POST: async () => run(),
      GET: async () => run(),
    },
  },
});
