import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SITE = "https://lmudanmark.dk";

export const acknowledgeLeagueRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ leagueId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Insert idempotent acknowledgement
    await supabaseAdmin
      .from("league_rules_acknowledgements")
      .upsert(
        { user_id: userId, league_id: data.leagueId },
        { onConflict: "user_id,league_id" },
      );

    // Try to promote this user's waitlist entry for the league if approved & capacity
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("approved")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.approved) return { ok: true, promoted: false };

    const { data: myEntry } = await supabaseAdmin
      .from("entries")
      .select("id,car_class,driver_category,waitlist")
      .eq("league_id", data.leagueId)
      .is("division_id", null)
      .eq("user_id", userId)
      .maybeSingle();
    if (!myEntry || !myEntry.waitlist) return { ok: true, promoted: false };

    const { data: league } = await supabaseAdmin
      .from("leagues")
      .select("class_configs,name")
      .eq("id", data.leagueId)
      .maybeSingle();
    const configs: Array<{ car_class: string; driver_category: string; max_drivers?: number | null }> =
      Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];
    const cfg = configs.find(
      (c) => c.car_class === myEntry.car_class && c.driver_category === myEntry.driver_category,
    );
    const cap = cfg?.max_drivers ?? null;

    const { data: siblings } = await supabaseAdmin
      .from("entries")
      .select("id,waitlist")
      .eq("league_id", data.leagueId)
      .is("division_id", null)
      .eq("car_class", myEntry.car_class)
      .eq("driver_category", myEntry.driver_category);
    const gridCount = (siblings ?? []).filter((s) => !s.waitlist).length;

    if (cap != null && gridCount >= cap) return { ok: true, promoted: false };

    await supabaseAdmin.from("entries").update({ waitlist: false }).eq("id", myEntry.id);

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title: `Du er rykket op fra ventelisten i ${league?.name ?? "ligaen"}`,
      body: `Tak fordi du har læst reglementet. Du er nu på griddet i ${myEntry.car_class} · ${myEntry.driver_category}.`,
      link: `/ligaer/${data.leagueId}`,
    });

    try {
      const { data: priv } = await supabaseAdmin
        .from("profiles_private")
        .select("discord_user_id")
        .eq("user_id", userId)
        .maybeSingle();
      const discordId = (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;
      if (discordId) {
        const { sendDiscordDM } = await import("./discord.server");
        await sendDiscordDM(
          discordId,
          `**Du er på griddet i ${league?.name ?? "ligaen"}**\n\nTak fordi du har læst reglementet. ${SITE}/ligaer/${data.leagueId}`,
        );
      }
    } catch (e) {
      console.error("rules-ack DM failed", e);
    }

    return { ok: true, promoted: true };
  });
