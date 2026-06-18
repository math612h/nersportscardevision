import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveBannerUrl } from "./league-announce.functions";

const SITE_URL = "https://www.lmudanmark.dk";
const DISCORD_INVITE_URL = "https://discord.gg/7Ye7R9qAHF";

function formatDanishDate(iso: string | null | undefined): string {
  if (!iso) return "TBA";
  try {
    return new Date(iso).toLocaleDateString("da-DK", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Copenhagen",
    });
  } catch {
    return "TBA";
  }
}

function buildSignupOpenMessageFb(args: {
  leagueName: string;
  leagueUrl: string;
  classConfigs: Array<{ car_class?: string; driver_category?: string; max_drivers?: number }> | null;
  divisions: Array<{ name: string | null; track: string | null; layout: string | null; race_date: string | null }>;
}): string {
  const classLines = (args.classConfigs ?? [])
    .filter((c) => c?.car_class)
    .map((c) => {
      const cat = c.driver_category ? ` (${c.driver_category})` : "";
      const seats = typeof c.max_drivers === "number" ? ` — ${c.max_drivers} pladser` : "";
      return `• ${c.car_class}${cat}${seats}`;
    });
  const calendarLines = args.divisions
    .slice()
    .sort(
      (a, b) =>
        (a.race_date ? new Date(a.race_date).getTime() : Infinity) -
        (b.race_date ? new Date(b.race_date).getTime() : Infinity),
    )
    .map((d, i) => {
      const round = `R${i + 1}`;
      const track = [d.track, d.layout].filter(Boolean).join(" – ") || d.name || "TBA";
      return `• ${round} — ${track} — 📆 ${formatDanishDate(d.race_date)}`;
    });
  const parts: string[] = [];
  parts.push("🏁🏁🏁  TILMELDINGEN ER ÅBEN!  🏁🏁🏁");
  parts.push("");
  parts.push(`🏆 ${args.leagueName}`);
  parts.push("");
  parts.push("Så er det nu! Sæt dig klar i pit-lane og snup din plads inden den er væk. 🔥");
  parts.push("");
  if (classLines.length) {
    parts.push("🏎️ Klasser & pladser");
    parts.push(...classLines);
    parts.push("");
  }
  if (calendarLines.length) {
    parts.push("📅 Sæsonkalender");
    parts.push(...calendarLines);
    parts.push("");
  }
  parts.push(`👉 Tilmeld dig her: ${args.leagueUrl}`);
  parts.push("");
  parts.push("Held og lykke derude — vi ses på banen! 🏎️💨");
  return parts.join("\n");
}

function buildCountdownMessageFb(args: {
  leagueName: string;
  leagueUrl: string;
  signupOpensAt: string;
  classConfigs: Array<{ car_class?: string; driver_category?: string; max_drivers?: number }> | null;
  divisions: Array<{ name: string | null; track: string | null; layout: string | null; race_date: string | null }>;
}): string {
  const classLines = (args.classConfigs ?? [])
    .filter((c) => c?.car_class)
    .map((c) => {
      const cat = c.driver_category ? ` (${c.driver_category})` : "";
      const seats = typeof c.max_drivers === "number" ? ` — ${c.max_drivers} pladser` : "";
      return `• ${c.car_class}${cat}${seats}`;
    });
  const calendarLines = args.divisions
    .slice()
    .sort(
      (a, b) =>
        (a.race_date ? new Date(a.race_date).getTime() : Infinity) -
        (b.race_date ? new Date(b.race_date).getTime() : Infinity),
    )
    .map((d, i) => {
      const round = `R${i + 1}`;
      const track = [d.track, d.layout].filter(Boolean).join(" – ") || d.name || "TBA";
      return `• ${round} — ${track} — 📆 ${formatDanishDate(d.race_date)}`;
    });
  const parts: string[] = [];
  parts.push("🚨🚨🚨  NY LIGA PÅ VEJ!  🚨🚨🚨");
  parts.push("");
  parts.push(`🏆 ${args.leagueName}`);
  parts.push("");
  parts.push(`⏳ Tilmeldingen åbner ${formatDanishDate(args.signupOpensAt)}`);
  parts.push("⏱️ Hold øje — pladserne plejer at gå stærkt! 🔥");
  parts.push("");
  parts.push("Spids blyanten, varm dækkene og gør setup'et klar. 🏎️💨");
  parts.push("");
  if (classLines.length) {
    parts.push("🏎️ Klasser & pladser");
    parts.push(...classLines);
    parts.push("");
  }
  if (calendarLines.length) {
    parts.push("📅 Sæsonkalender (foreløbig)");
    parts.push(...calendarLines);
    parts.push("");
  }
  parts.push(`👉 Læs mere her: ${args.leagueUrl}`);
  parts.push("");
  parts.push("Vi ses på banen! 🏎️💨");
  return parts.join("\n");
}

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
      ? buildSignupOpenMessageFb({
          leagueName: league.name as string,
          leagueUrl,
          classConfigs: (league as any).class_configs ?? null,
          divisions: (divs ?? []) as any,
        })
      : buildCountdownMessageFb({
          leagueName: league.name as string,
          leagueUrl,
          signupOpensAt: opensAtRaw as string,
          classConfigs: (league as any).class_configs ?? null,
          divisions: (divs ?? []) as any,
        });

    const discordReminder =
      "HUSK: Du skal være medlem af vores Discord for at få fuld adgang til hjemmesiden og ligaerne.\n" +
      `Join her: ${DISCORD_INVITE_URL}`;

    return {
      leagueName: league.name as string,
      bannerUrl,
      text,
      discordReminder,
    };
  });
