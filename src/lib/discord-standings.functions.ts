import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const postLeagueStandingsToDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leagueId: string; channelId?: string }) => {
    if (!data?.leagueId || typeof data.leagueId !== "string") throw new Error("leagueId mangler.");
    const ch = data.channelId?.trim();
    if (ch && !/^\d{5,25}$/.test(ch)) throw new Error("Kanal-ID skal kun indeholde tal.");
    return { leagueId: data.leagueId, channelId: ch || undefined };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) throw new Error("Kun admins.");

    const { buildLeagueStandingsEmbeds } = await import("./discord-standings.server");
    const { sendDiscordChannelRichMessage } = await import("./discord.server");

    const { leagueName, channelId, embeds } = await buildLeagueStandingsEmbeds(supabaseAdmin, data.leagueId);
    const target = data.channelId ?? channelId;
    if (!target) {
      throw new Error("Ingen Discord-kanal til stillinger. Indsæt kanal-ID i liga-redigeringen.");
    }
    if (embeds.length === 0) throw new Error("Ingen offentliggjorte resultater at sende endnu.");

    const stamp = new Date().toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" });
    let sent = 0;
    for (let i = 0; i < embeds.length; i += 10) {
      const batch = embeds.slice(i, i + 10);
      const res = await sendDiscordChannelRichMessage(target, {
        content: i === 0 ? `📊 **${leagueName} — stillinger**\nOpdateret ${stamp}` : undefined,
        embeds: batch as unknown as Array<Record<string, unknown>>,
      });
      if (!res.ok) throw new Error(`Discord afviste beskeden (HTTP ${res.status}): ${res.message ?? ""}`);
      sent += batch.length;
    }
    return { ok: true as const, sections: sent, channelId: target };
  });
