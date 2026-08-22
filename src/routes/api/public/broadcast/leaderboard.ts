import { createFileRoute } from "@tanstack/react-router";
import { pickCurrentPatch } from "@/lib/lmu-version";
import {
  groupBestLaps,
  type RawLeaderboardTime,
} from "@/lib/broadcast-leaderboard";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

const PAGE_SIZE = 1000;

// GET /api/public/broadcast/leaderboard
//
// Offentligt feed med kørernes hurtigste omgange (PB'er) fra leaderboardet,
// beregnet som bedste tid pr. (bane, layout, bilklasse) pr. kører.
// Feedet inkluderer alle registrerede brugere der har sat en tid – uafhængigt af
// liga- eller divisionsmedlemskab.
//
// Query-parametre (kan kombineres):
//   driverId=<id,id>  – kun specifikke kørere (uuid, kommasepareret)
//   track=<navn>      – kun tider på baner der matcher (fuzzy)
//   class=<klasse>    – kun tider i bilklassen (fx "LMGT3", fuzzy)
//   onlyCurrent=1     – kun tider sat på den aktuelle patch
export const Route = createFileRoute("/api/public/broadcast/leaderboard")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const url = new URL(request.url);
          const driverParam = url.searchParams.get("driverId")?.trim() || null;
          const trackMatch = url.searchParams.get("track")?.trim() || null;
          const classMatch = url.searchParams.get("class")?.trim() || null;
          const onlyCurrent = ["1", "true", "yes"].includes(
            (url.searchParams.get("onlyCurrent") ?? "").toLowerCase(),
          );

          // Optional scoping: specific drivers.
          let userFilter: string[] | null = null;
          if (driverParam) {
            userFilter = driverParam
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }

          // Aktuel patch (major.minor) på tværs af hele leaderboardet.
          const versions: Array<string | null> = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await supabaseAdmin
              .from("leaderboard_times")
              .select("game_version")
              .not("game_version", "is", null)
              .range(from, from + PAGE_SIZE - 1);
            if (error) throw error;
            versions.push(
              ...((data ?? []) as Array<{ game_version: string | null }>).map(
                (r) => r.game_version,
              ),
            );
            if ((data?.length ?? 0) < PAGE_SIZE) break;
          }
          const currentPatch = pickCurrentPatch(versions);

          // Hent tider (sidelæst i bidder, kun registrerede brugere).
          const rows: RawLeaderboardTime[] = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            let q = supabaseAdmin
              .from("leaderboard_times")
              .select(
                "user_id,driver_name,track,layout,car_class,car_model,best_lap_ms,recorded_at,created_at,game_version",
              )
              .not("user_id", "is", null)
              .order("best_lap_ms", { ascending: true })
              .range(from, from + PAGE_SIZE - 1);
            if (userFilter) {
              if (!userFilter.length) {
                rows.length = 0;
                break;
              }
              q = q.in("user_id", userFilter);
            }
            if (trackMatch) q = q.ilike("track", `%${trackMatch}%`);
            if (classMatch) q = q.ilike("car_class", `%${classMatch}%`);
            const { data, error } = await q;
            if (error) throw error;
            rows.push(...((data ?? []) as RawLeaderboardTime[]));
            if ((data?.length ?? 0) < PAGE_SIZE) break;
          }

          const userIds = [...new Set(rows.map((r) => r.user_id!))];
          const { data: profiles } = userIds.length
            ? await supabaseAdmin
                .from("profiles")
                .select("id, display_name, lmu_name, avatar_url")
                .in("id", userIds)
            : { data: [] as any[] };

          const nameByUser = new Map<string, string>();
          const lmuNameByUser = new Map<string, string | null>();
          const avatarByUser = new Map<string, string | null>();
          for (const p of (profiles ?? []) as any[]) {
            nameByUser.set(p.id, p.display_name || p.lmu_name || "");
            lmuNameByUser.set(p.id, p.lmu_name ?? null);
            avatarByUser.set(p.id, p.avatar_url ?? null);
          }

          let drivers = groupBestLaps(rows, currentPatch, {
            nameByUser,
            lmuNameByUser,
            avatarByUser,
          });

          if (onlyCurrent) {
            drivers = drivers
              .map((d) => ({
                ...d,
                bests: d.bests.filter((b) => b.currentPatch),
              }))
              .filter((d) => d.bests.length > 0);
          }

          return Response.json(
            {
              currentPatch,
              generatedAt: new Date().toISOString(),
              filters: {
                driverId: driverParam,
                track: trackMatch,
                class: classMatch,
                onlyCurrent,
              },
              drivers,
            },
            { status: 200, headers: CORS },
          );
        } catch (e) {
          console.error("[broadcast/leaderboard]", e);
          return Response.json(
            { error: "Serverfejl" },
            { status: 500, headers: CORS },
          );
        }
      },
    },
  },
});
