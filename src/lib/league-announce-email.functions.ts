import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSignupOpenMessage,
  buildCountdownMessage,
  resolveBannerUrl,
} from "./league-announce.functions";

const SITE_URL = "https://www.lmudanmark.dk";

export const buildLeagueAnnouncementEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leagueId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins.");

    const { data: league, error: lErr } = await supabaseAdmin
      .from("leagues")
      .select("id, name, signup_opens_at, class_configs, banner_url")
      .eq("id", data.leagueId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!league) throw new Error("Liga findes ikke.");

    const leagueUrl = `${SITE_URL}/ligaer/${league.id}`;
    const bannerUrl = await resolveBannerUrl(supabaseAdmin, (league as any).banner_url ?? null);

    const { data: divs } = await supabaseAdmin
      .from("divisions")
      .select("name, track, layout, race_date")
      .eq("league_id", league.id as string)
      .order("race_date", { ascending: true });

    const opensAtRaw = (league as any).signup_opens_at as string | null;
    const opensAt = opensAtRaw ? new Date(opensAtRaw).getTime() : null;
    const isOpen = opensAt === null || opensAt <= Date.now();

    const text = isOpen
      ? buildSignupOpenMessage({
          leagueName: league.name as string,
          leagueUrl,
          classConfigs: (league as any).class_configs ?? null,
          divisions: (divs ?? []) as any,
        })
      : buildCountdownMessage({
          leagueName: league.name as string,
          leagueUrl,
          signupOpensAt: opensAtRaw as string,
          classConfigs: (league as any).class_configs ?? null,
          divisions: (divs ?? []) as any,
        });

    return {
      leagueName: league.name as string,
      bannerUrl,
      text,
    };
  });
