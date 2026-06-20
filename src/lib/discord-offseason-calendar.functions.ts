import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getTrackImageFile } from "@/lib/tracks";

export const postOffseasonCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leagueId: string; channelId: string }) => {
    if (!data?.leagueId || typeof data.leagueId !== "string") throw new Error("leagueId mangler.");
    if (!data?.channelId || !/^\d{5,25}$/.test(data.channelId.trim())) {
      throw new Error("channelId skal være et Discord-kanal-ID (kun tal).");
    }
    return { leagueId: data.leagueId, channelId: data.channelId.trim() };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins.");

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) throw new Error("DISCORD_BOT_TOKEN mangler.");

    const { data: league, error: lerr } = await supabaseAdmin
      .from("leagues")
      .select("id,name")
      .eq("id", data.leagueId)
      .maybeSingle();
    if (lerr) throw lerr;
    if (!league) throw new Error("Liga ikke fundet.");

    const { data: divisions, error: derr } = await supabaseAdmin
      .from("divisions")
      .select("id,name,track,layout,race_date")
      .eq("league_id", league.id)
      .order("race_date", { ascending: true, nullsFirst: false });
    if (derr) throw derr;
    if (!divisions || divisions.length === 0) throw new Error("Ingen afdelinger i ligaen.");

    // Sign track images (1 year so Discord can cache; embeds break otherwise).
    const files = Array.from(
      new Set(divisions.map((d: any) => getTrackImageFile(d.track)).filter((f): f is string => !!f)),
    );
    const urlMap = new Map<string, string>();
    if (files.length > 0) {
      const { data: signed, error: serr } = await supabaseAdmin.storage
        .from("track-images")
        .createSignedUrls(files, 60 * 60 * 24 * 365);
      if (serr) throw serr;
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlMap.set(s.path, s.signedUrl);
      }
    }

    const embeds = divisions.slice(0, 10).map((d: any) => {
      const file = getTrackImageFile(d.track);
      const img = file ? urlMap.get(file) : undefined;
      const unix = d.race_date ? Math.floor(new Date(d.race_date).getTime() / 1000) : null;
      const trackLine = [d.track, d.layout].filter(Boolean).join(" · ");
      const descLines = [
        trackLine ? `📍 ${trackLine}` : null,
        unix ? `🕘 <t:${unix}:F> (<t:${unix}:R>)` : null,
      ].filter(Boolean);
      return {
        title: d.name,
        description: descLines.join("\n"),
        color: 0xe11d48,
        ...(img ? { image: { url: img } } : {}),
      };
    });

    const body = {
      content: `📅 **${league.name} — kalender**\nHer er alle afdelinger i sæsonen. Klik på en bane for mere info på hjemmesiden.`,
      embeds,
      allowed_mentions: { parse: [] as string[] },
    };

    const res = await fetch(
      `https://discord.com/api/v10/channels/${data.channelId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (res.status !== 200 && res.status !== 201) {
      const t = await res.text().catch(() => "");
      throw new Error(`Discord-svar ${res.status}: ${t}`);
    }
    return { ok: true as const, posted: embeds.length, league: league.name };
  });
