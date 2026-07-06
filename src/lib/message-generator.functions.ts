import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSignupOpenMessage,
  buildCountdownMessage,
} from "./league-announce.functions";
import { getTrackImageFile } from "./tracks";

const SITE_URL = "https://www.lmudanmark.dk";

export type AutoMessageType =
  | "signup_open"
  | "remaining_seats"
  | "standings"
  | "division_briefing";

export type AutoMessageFormat = "discord" | "email";

type ClassConfig = {
  car_class?: string;
  driver_category?: string;
  max_drivers?: number;
};

type ResultRow = {
  driver_name: string;
  car_number: number;
  car_class: string;
  driver_category: string;
  position: number;
  class_position: number;
  points: number;
  fastest_lap?: boolean;
  penalty_points?: number;
  dns?: boolean;
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Kun admins.");
}

const inputSchema = z.object({
  leagueId: z.string().uuid(),
  type: z.enum(["signup_open", "remaining_seats", "standings", "division_briefing"]),
  format: z.enum(["discord", "email"]),
  divisionId: z.string().uuid().optional(),
});

export const generateAutoMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ title: string; body: string }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: league, error: lErr } = await supabaseAdmin
      .from("leagues")
      .select("id, name, signup_opens_at, class_configs, separate_division_standings, points_system, briefing_required")
      .eq("id", data.leagueId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!league) throw new Error("Liga findes ikke.");

    const leagueName = (league as any).name as string;
    const leagueUrl = `${SITE_URL}/ligaer/${league.id}`;
    const classConfigs: ClassConfig[] = Array.isArray((league as any).class_configs)
      ? (league as any).class_configs
      : [];

    const { data: divs } = await supabaseAdmin
      .from("divisions")
      .select("id, name, track, layout, race_date, settings, image_url, server_started_at")
      .eq("league_id", league.id as string)
      .order("race_date", { ascending: true });

    const divisions = (divs ?? []) as Array<{
      id: string;
      name: string | null;
      track: string | null;
      layout: string | null;
      race_date: string | null;
      settings: any;
      image_url: string | null;
      server_started_at: string | null;
    }>;


    // --- 1. Signup open ---
    if (data.type === "signup_open") {
      const opensAtRaw = (league as any).signup_opens_at as string | null;
      const opensAt = opensAtRaw ? new Date(opensAtRaw).getTime() : null;
      const isOpen = opensAt === null || opensAt <= Date.now();
      const body = isOpen
        ? buildSignupOpenMessage({
            leagueName,
            leagueUrl,
            classConfigs,
            divisions,
          })
        : buildCountdownMessage({
            leagueName,
            leagueUrl,
            signupOpensAt: opensAtRaw as string,
            classConfigs,
            divisions,
          });
      return {
        title: isOpen
          ? `Tilmeldingen til ${leagueName} er åben`
          : `${leagueName} — tilmelding åbner snart`,
        body: data.format === "email" ? stripDiscordMarkup(body) : body,
      };
    }

    // --- 2. Remaining seats ---
    if (data.type === "remaining_seats") {
      const { data: entries } = await supabaseAdmin
        .from("entries")
        .select("car_class, driver_category, waitlist")
        .eq("league_id", league.id as string);
      const grid = (entries ?? []).filter((e: any) => !e.waitlist);
      const counts = new Map<string, number>();
      for (const e of grid as any[]) {
        const k = `${e.car_class}|${e.driver_category ?? ""}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }

      const isDiscord = data.format === "discord";
      const B = isDiscord ? "**" : "";
      const lines: string[] = [];
      if (isDiscord) {
        lines.push("🏁🏁🏁  " + B + "DER ER STADIG PLADSER!" + B + "  🏁🏁🏁", "");
      } else {
        lines.push("Der er stadig pladser på gridden!", "");
      }
      lines.push(`🏆 ${B}${leagueName}${B}`, "");
      lines.push(
        "Vi mangler stadig kørere for at fylde gridden helt op — snup en plads inden det er for sent. 🔥",
        "",
      );

      const seatLines: string[] = [];
      for (const c of classConfigs) {
        if (!c.car_class) continue;
        const cap = typeof c.max_drivers === "number" ? c.max_drivers : null;
        if (cap === null) continue;
        const k = `${c.car_class}|${c.driver_category ?? ""}`;
        const taken = counts.get(k) ?? 0;
        const remaining = Math.max(0, cap - taken);
        const cat = c.driver_category ? ` (${c.driver_category})` : "";
        if (remaining <= 0) {
          seatLines.push(`• ${c.car_class}${cat} — ${B}FULD${B} ✅`);
        } else {
          seatLines.push(
            `• ${c.car_class}${cat} — ${B}${remaining} plads${remaining === 1 ? "" : "er"} tilbage${B} (${taken}/${cap})`,
          );
        }
      }
      if (seatLines.length === 0) {
        seatLines.push("• Ingen kapacitetsgrænser konfigureret.");
      }
      lines.push(`🏎️ ${B}Ledige pladser${B}`, ...seatLines, "");
      lines.push(`👉 ${B}Tilmeld dig her:${B} ${leagueUrl}`, "");
      lines.push("Vi ses på banen! 🏎️💨");

      return {
        title: `Ledige pladser i ${leagueName}`,
        body: lines.join("\n"),
      };
    }

    // --- 4. Division briefing (pre-race summary for a single division) ---
    if (data.type === "division_briefing") {
      if (!data.divisionId) throw new Error("Vælg en afdeling.");
      const div = divisions.find((d) => d.id === data.divisionId);
      if (!div) throw new Error("Afdeling findes ikke i denne liga.");

      const isDiscord = data.format === "discord";
      const B = isDiscord ? "**" : "";
      const briefingRequired = (league as any).briefing_required !== false;

      const eventSettings = (div.settings?.event_settings ?? {}) as {
        practice_minutes?: number;
        quali_minutes?: number;
        race_minutes?: number;
        briefing_open_minutes_before?: number;
      };

      const raceStart = div.race_date ? new Date(div.race_date) : null;
      const briefingMinutesBefore = 20;
      const briefingStart = raceStart
        ? new Date(raceStart.getTime() - briefingMinutesBefore * 60_000)
        : null;
      const serverStart = div.server_started_at ? new Date(div.server_started_at) : null;

      const fmtDateTime = (d: Date) =>
        new Intl.DateTimeFormat("da-DK", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Copenhagen",
        }).format(d);
      const fmtTime = (d: Date) =>
        new Intl.DateTimeFormat("da-DK", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Copenhagen",
        }).format(d);

      const divisionLabel =
        div.name ??
        [div.track, div.layout].filter(Boolean).join(" – ") ??
        "Afdeling";
      const trackLabel = [div.track, div.layout].filter(Boolean).join(" – ") || "TBA";
      const divisionUrl = `${SITE_URL}/ligaer/${league.id}/afdeling/${div.id}`;

      // Resolve division/track image
      let imageUrl: string | null = div.image_url ?? null;
      if (!imageUrl) {
        const file = getTrackImageFile(div.track);
        if (file) {
          const { data: signed } = await supabaseAdmin.storage
            .from("track-images")
            .createSignedUrl(file, 60 * 60 * 24 * 30);
          imageUrl = signed?.signedUrl ?? null;
        }
      }

      const lines: string[] = [];
      if (isDiscord) {
        lines.push("🏁🏁🏁  " + B + `${leagueName.toUpperCase()} — ${divisionLabel.toUpperCase()}` + B + "  🏁🏁🏁", "");
      } else {
        lines.push(`${leagueName} — ${divisionLabel}`, "");
      }

      // Track + evt. billede først, så det står øverst i Discord-embed
      lines.push(`📍 ${B}Bane${B}: ${trackLabel}`, "");
      if (imageUrl && isDiscord) {
        lines.push(imageUrl, "");
      }

      // Program for løbsaftenen
      lines.push(`📅 ${B}Program${B}`);
      if (serverStart) {
        lines.push(`• ${B}Server åbner${B}: ${fmtDateTime(serverStart)}`);
      } else {
        lines.push(`• ${B}Server åbner${B}: annonceres inden løbet`);
      }
      const programBits: string[] = [];
      if (typeof eventSettings.practice_minutes === "number") {
        programBits.push(`Practice ${eventSettings.practice_minutes} min`);
      }
      if (typeof eventSettings.quali_minutes === "number") {
        programBits.push(`Qualifying ${eventSettings.quali_minutes} min`);
      }
      if (typeof eventSettings.race_minutes === "number") {
        programBits.push(`Race ${eventSettings.race_minutes} min`);
      }
      if (programBits.length) {
        lines.push(`• ${B}Session-længder${B}: ${programBits.join(" → ")}`);
      }
      if (raceStart) {
        lines.push(`• ${B}Race starter${B}: ${fmtTime(raceStart)}`);
      }
      lines.push("");

      // Briefing
      lines.push(`🎙️ ${B}Drivers Briefing${B}`);
      if (briefingStart) {
        lines.push(
          `• Starter ${fmtTime(briefingStart)} (${briefingMinutesBefore} min før race).`,
        );
      } else {
        lines.push(`• Starter ${briefingMinutesBefore} min før race-sessionen.`);
      }
      if (briefingRequired) {
        lines.push(`• ${B}Obligatorisk${B} — du skal deltage for at kunne køre med i racet.`);
      } else {
        lines.push(`• Anbefalet, men ikke obligatorisk.`);
      }
      lines.push("");

      // Server info link
      lines.push(`🔐 ${B}Server info${B} (kode, password, practice-servere)`);
      lines.push(`• Log ind og find det på afdelingens side: ${divisionUrl}`);
      lines.push("");

      lines.push("Vi ses på banen! 🏎️💨");

      const body = lines.join("\n");
      return {
        title: `${leagueName} — ${divisionLabel}: Løbsaften`,
        body: data.format === "email" ? stripDiscordMarkup(body) : body,
      };
    }



    // --- 3. Standings ---
    const leagueFlPoints = Number(
      ((league as any).points_system?.fastest_lap_points) ?? 1,
    );
    const completed = divisions.filter(
      (d) => d.settings?.completed && Array.isArray(d.settings?.results),
    );
    if (completed.length === 0) {
      throw new Error("Der er ingen afsluttede løb — kan ikke lave en stilling endnu.");
    }

    type Agg = {
      car_number: number;
      driver_name: string;
      car_class: string;
      driver_category: string;
      total: number;
      races: number;
    };
    const separate = !!(league as any).separate_division_standings;
    const isDiscord = data.format === "discord";
    const B = isDiscord ? "**" : "";

    const buildTable = (rows: ResultRow[], label: string): string[] => {
      const map = new Map<string, Agg>();
      for (const r of rows) {
        const key = `${r.car_class}|${r.driver_category}|${r.car_number}`;
        const cur = map.get(key) ?? {
          car_number: r.car_number,
          driver_name: r.driver_name,
          car_class: r.car_class,
          driver_category: r.driver_category,
          total: 0,
          races: 0,
        };
        const flPts = r.fastest_lap ? leagueFlPoints : 0;
        const pen = Math.max(0, Number(r.penalty_points ?? 0));
        cur.total += Math.max(0, r.points + flPts - pen);
        cur.races += 1;
        map.set(key, cur);
      }

      const out: string[] = [];
      const byClass = new Map<string, Agg[]>();
      for (const a of map.values()) {
        const k = `${a.car_class}${a.driver_category ? " · " + a.driver_category : ""}`;
        const arr = byClass.get(k) ?? [];
        arr.push(a);
        byClass.set(k, arr);
      }
      out.push(`${B}${label}${B}`, "");
      for (const [cls, list] of byClass) {
        list.sort((x, y) => y.total - x.total);
        out.push(`🏎️ ${B}${cls}${B}`);
        const podium = ["🥇", "🥈", "🥉"];
        list.slice(0, 10).forEach((row, i) => {
          const badge = podium[i] ?? `${(i + 1).toString().padStart(2, " ")}.`;
          out.push(`${badge} ${row.driver_name} — ${B}${row.total}${B} p.`);
        });
        out.push("");
      }
      return out;
    };

    const parts: string[] = [];
    if (isDiscord) {
      parts.push("🏆🏆🏆  " + B + "FORELØBIG STILLING" + B + "  🏆🏆🏆", "");
    } else {
      parts.push("Foreløbig stilling", "");
    }
    parts.push(`${B}${leagueName}${B}`, "");
    parts.push(
      `Efter ${completed.length} ${completed.length === 1 ? "løb" : "løb"} af ${divisions.length}.`,
      "",
    );

    if (separate) {
      for (const d of completed) {
        const label =
          d.name ??
          [d.track, d.layout].filter(Boolean).join(" – ") ??
          "Afdeling";
        parts.push(...buildTable(d.settings.results as ResultRow[], label));
      }
    } else {
      const all: ResultRow[] = [];
      for (const d of completed) all.push(...(d.settings.results as ResultRow[]));
      parts.push(...buildTable(all, "Samlet stilling"));
    }

    parts.push(`👉 Se hele stillingen: ${leagueUrl}#stillinger`);

    return {
      title: `Foreløbig stilling — ${leagueName}`,
      body: parts.join("\n"),
    };
  });

function stripDiscordMarkup(s: string): string {
  return s
    .replace(/<@&\d+>\s*\n?\n?/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1");
}
