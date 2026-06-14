import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DISCORD_ANNOUNCE_CHANNEL_ID = "1514985014255943881";
const DISCORD_MEMBERS_ROLE_ID = "1336326061654278186";
const SITE_URL = "https://www.lmudanmark.dk";

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

async function resolveBannerUrl(admin: any, bannerPath: string | null): Promise<string | null> {
  if (!bannerPath) return null;
  if (bannerPath.startsWith("http")) return bannerPath;
  const { data: signed } = await admin.storage
    .from("league-banners")
    .createSignedUrl(bannerPath, 60 * 60 * 24 * 30);
  return signed?.signedUrl ?? null;
}

async function postDiscordMessage(
  content: string,
  bannerUrl: string | null,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return { ok: false, status: 0, error: "DISCORD_BOT_TOKEN er ikke konfigureret" };
  const url = `https://discord.com/api/v10/channels/${DISCORD_ANNOUNCE_CHANNEL_ID}/messages`;
  const headers = {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };
  const body: Record<string, unknown> = {
    content: content.slice(0, 1900),
    allowed_mentions: { parse: [], roles: [DISCORD_MEMBERS_ROLE_ID] },
  };
  if (bannerUrl) body.embeds = [{ image: { url: bannerUrl }, color: 0xe11d2a }];

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.ok) return { ok: true, status: res.status };

  const text = await res.text().catch(() => "");
  if (res.status === 403) {
    const fallback = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: content.replace(`<@&${DISCORD_MEMBERS_ROLE_ID}>\n\n`, "").slice(0, 1900),
        allowed_mentions: { parse: [] },
      }),
    });
    if (fallback.ok) return { ok: true, status: fallback.status };
    const fbText = await fallback.text().catch(() => "");
    return { ok: false, status: fallback.status, error: fbText || text };
  }
  return { ok: false, status: res.status, error: text };
}

function buildSignupOpenMessage(args: {
  leagueName: string;
  leagueUrl: string;
  classConfigs: Array<{ car_class?: string; driver_category?: string; max_drivers?: number }> | null;
  divisions: Array<{ name: string | null; track: string | null; layout: string | null; race_date: string | null }>;
}): string {
  const classLines = (args.classConfigs ?? [])
    .filter((c) => c?.car_class)
    .map((c) => {
      const cat = c.driver_category ? ` (${c.driver_category})` : "";
      const seats = typeof c.max_drivers === "number" ? ` — **${c.max_drivers} pladser**` : "";
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
      return `• **${round}** — ${track} — 📆 ${formatDanishDate(d.race_date)}`;
    });
  const parts: string[] = [];
  parts.push(`<@&${DISCORD_MEMBERS_ROLE_ID}>`);
  parts.push("");
  parts.push("🏁🏁🏁  **TILMELDINGEN ER ÅBEN!**  🏁🏁🏁");
  parts.push("");
  parts.push(`🏆 **${args.leagueName}**`);
  parts.push("");
  parts.push("Så er det nu! Sæt dig klar i pit-lane og snup din plads inden den er væk. 🔥");
  parts.push("");
  if (classLines.length) {
    parts.push("🏎️ **Klasser & pladser**");
    parts.push(...classLines);
    parts.push("");
  }
  if (calendarLines.length) {
    parts.push("📅 **Sæsonkalender**");
    parts.push(...calendarLines);
    parts.push("");
  }
  parts.push(`👉 **Tilmeld dig her:** ${args.leagueUrl}`);
  parts.push("");
  parts.push("Held og lykke derude — vi ses på banen! 🏎️💨");
  return parts.join("\n");
}

function buildCountdownMessage(args: {
  leagueName: string;
  leagueUrl: string;
  signupOpensAt: string;
  classConfigs: Array<{ car_class?: string; driver_category?: string; max_drivers?: number }> | null;
  divisions: Array<{ name: string | null; track: string | null; layout: string | null; race_date: string | null }>;
}): string {
  const unix = Math.floor(new Date(args.signupOpensAt).getTime() / 1000);
  const classLines = (args.classConfigs ?? [])
    .filter((c) => c?.car_class)
    .map((c) => {
      const cat = c.driver_category ? ` (${c.driver_category})` : "";
      const seats = typeof c.max_drivers === "number" ? ` — **${c.max_drivers} pladser**` : "";
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
      return `• **${round}** — ${track} — 📆 ${formatDanishDate(d.race_date)}`;
    });
  const parts: string[] = [];
  parts.push(`<@&${DISCORD_MEMBERS_ROLE_ID}>`);
  parts.push("");
  parts.push("🚨🚨🚨  **NY LIGA PÅ VEJ!**  🚨🚨🚨");
  parts.push("");
  parts.push(`🏆 **${args.leagueName}**`);
  parts.push("");
  parts.push(`⏳ Tilmeldingen åbner <t:${unix}:F>`);
  parts.push(`⏱️ Det er **<t:${unix}:R>** — så hold øje!`);
  parts.push("");
  parts.push("Spids blyanten, varm dækkene og gør setup'et klar — pladserne plejer at gå hurtigt når der åbnes. 🔥");
  parts.push("");
  if (classLines.length) {
    parts.push("🏎️ **Klasser & pladser**");
    parts.push(...classLines);
    parts.push("");
  }
  if (calendarLines.length) {
    parts.push("📅 **Sæsonkalender (foreløbig)**");
    parts.push(...calendarLines);
    parts.push("");
  }
  parts.push(`👉 Læs mere her: ${args.leagueUrl}`);
  parts.push("");
  parts.push("Vi ses på banen! 🏎️💨");
  return parts.join("\n");
}

export const sendLeagueAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leagueId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins kan sende annonceringer.");

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
    const now = Date.now();
    const isOpen = opensAt === null || opensAt <= now;

    const content = isOpen
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

    const res = await postDiscordMessage(content, bannerUrl);
    if (!res.ok) throw new Error(`Discord-fejl (${res.status}): ${res.error ?? "ukendt"}`);

    // Mark as already-notified so the cron doesn't send a duplicate when signup opens.
    if (isOpen) {
      await supabaseAdmin
        .from("leagues")
        .update({ discord_signup_open_notified_at: new Date().toISOString() } as any)
        .eq("id", league.id);
    }

    return { ok: true, kind: isOpen ? ("signup-open" as const) : ("countdown" as const) };
  });
