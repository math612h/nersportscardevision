import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

// GET /api/public/broadcast/team-lineups
//
// Offentligt feed med team-lineups pr. liga, så broadcast-kontrolpanelet kan
// hente hvilke kørere der er på et bestemt lineup og synkronisere dem.
//
// Query-parametre (kan kombineres):
//   league=<navn>      – fuzzy match på liganavn (kun publicerede ligaer)
//   leagueId=<uuid>    – præcis liga
//   teamId=<uuid>      – kun ét team
//   lineupId=<uuid>    – kun ét bestemt lineup (league_team_entries.id)
//   class=<klasse>     – kun lineups i bilklassen (fx "LMGT3")
//   status=all         – medtag også ubekræftede/afviste lineups
export const Route = createFileRoute("/api/public/broadcast/team-lineups")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const url = new URL(request.url);
          const leagueMatch = url.searchParams.get("league")?.trim() || null;
          const leagueId = url.searchParams.get("leagueId")?.trim() || null;
          const teamId = url.searchParams.get("teamId")?.trim() || null;
          const lineupId = url.searchParams.get("lineupId")?.trim() || null;
          const classMatch = url.searchParams.get("class")?.trim().toLowerCase() || null;
          const includeAll = (url.searchParams.get("status") ?? "").toLowerCase() === "all";

          let resolvedLeague: { id: string; name: string } | null = null;
          if (leagueId) {
            const { data } = await supabaseAdmin
              .from("leagues")
              .select("id, name")
              .eq("id", leagueId)
              .maybeSingle();
            resolvedLeague = (data as any) ?? null;
            if (!resolvedLeague) {
              return Response.json({ error: "Liga ikke fundet" }, { status: 404, headers: CORS });
            }
          } else if (leagueMatch) {
            const { data } = await supabaseAdmin
              .from("leagues")
              .select("id, name")
              .ilike("name", `%${leagueMatch}%`)
              .eq("published", true)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            resolvedLeague = (data as any) ?? null;
            if (!resolvedLeague) {
              return Response.json({ error: "Liga ikke fundet" }, { status: 404, headers: CORS });
            }
          }

          let entryQuery = (supabaseAdmin as any)
            .from("league_team_entries")
            .select(
              "id, league_id, team_id, car_class, status, locked_at, created_at, leagues:league_id(id, name, published), teams:team_id(id, name, logo_url), league_team_lineup(id, user_id, status, responded_at)",
            );
          if (resolvedLeague) entryQuery = entryQuery.eq("league_id", resolvedLeague.id);
          if (teamId) entryQuery = entryQuery.eq("team_id", teamId);
          if (lineupId) entryQuery = entryQuery.eq("id", lineupId);
          if (!includeAll) entryQuery = entryQuery.neq("status", "withdrawn");

          const { data: entryRows, error: eErr } = await entryQuery;
          if (eErr) throw eErr;

          let rows = ((entryRows ?? []) as any[]).filter((r) => r.leagues?.published !== false);
          if (classMatch) {
            rows = rows.filter((r) => (r.car_class ?? "").toLowerCase().includes(classMatch));
          }

          const userIds = [
            ...new Set(
              rows.flatMap((r) => (r.league_team_lineup ?? []).map((l: any) => l.user_id as string)),
            ),
          ];

          const { data: profiles } = userIds.length
            ? await supabaseAdmin
                .from("profiles")
                .select("id, display_name, lmu_name, stream_photo_path, avatar_url, discord_avatar_url")
                .in("id", userIds)
            : { data: [] as any[] };

          const photoUrls = new Map<string, string>();
          const withPhoto = ((profiles ?? []) as any[]).filter((p) => p.stream_photo_path);
          if (withPhoto.length) {
            const { data: signed } = await supabaseAdmin.storage
              .from("stream-photos")
              .createSignedUrls(
                withPhoto.map((p: any) => p.stream_photo_path as string),
                60 * 60 * 24 * 7,
              );
            (signed ?? []).forEach((s: any, i: number) => {
              if (s?.signedUrl) photoUrls.set(withPhoto[i].id, s.signedUrl);
            });
          }

          const profileById = new Map<string, any>();
          for (const p of (profiles ?? []) as any[]) profileById.set(p.id, p);

          // Startnumre/klasse fra kørernes egne tilmeldinger i samme liga.
          const leagueIds = [...new Set(rows.map((r) => r.league_id as string))];
          const { data: entriesRows } = userIds.length && leagueIds.length
            ? await supabaseAdmin
                .from("entries")
                .select("user_id, league_id, car_number, car_class, driver_category, driver_name, waitlist")
                .in("league_id", leagueIds)
                .in("user_id", userIds)
            : { data: [] as any[] };
          const entryByKey = new Map<string, any>();
          for (const e of (entriesRows ?? []) as any[]) entryByKey.set(`${e.league_id}:${e.user_id}`, e);

          const lineups = rows.map((r) => {
            const drivers = ((r.league_team_lineup ?? []) as any[])
              .filter((l) => (includeAll ? true : l.status !== "declined"))
              .map((l) => {
                const p = profileById.get(l.user_id);
                const ent = entryByKey.get(`${r.league_id}:${l.user_id}`);
                return {
                  lineupMemberId: l.id,
                  driverId: l.user_id,
                  driverName: p?.display_name || p?.lmu_name || ent?.driver_name || "",
                  status: l.status,
                  respondedAt: l.responded_at ?? null,
                  carNumber: ent?.car_number != null ? String(ent.car_number) : null,
                  carClass: ent?.car_class ?? r.car_class ?? null,
                  category: ent?.driver_category ?? null,
                  waitlist: ent?.waitlist === true,
                  photoUrl: photoUrls.get(l.user_id) ?? null,
                  avatarUrl:
                    photoUrls.get(l.user_id) ??
                    p?.discord_avatar_url ??
                    p?.avatar_url ??
                    null,
                  hasStreamPhoto: !!p?.stream_photo_path,
                };
              })
              .sort((a, b) => (a.driverName || "").localeCompare(b.driverName || "", "da"));

            return {
              lineupId: r.id,
              status: r.status,
              carClass: r.car_class ?? null,
              lockedAt: r.locked_at ?? null,
              createdAt: r.created_at ?? null,
              league: { id: r.league_id, name: r.leagues?.name ?? null },
              team: {
                id: r.team_id,
                name: r.teams?.name ?? null,
                logoUrl: r.teams?.logo_url ?? null,
              },
              carNumber:
                drivers.find((d) => d.carNumber)?.carNumber ?? null,
              drivers,
            };
          });

          lineups.sort((a, b) => {
            const t = (a.team.name ?? "").localeCompare(b.team.name ?? "", "da");
            return t !== 0 ? t : (a.carClass ?? "").localeCompare(b.carClass ?? "", "da");
          });

          if (lineupId && lineups.length === 0) {
            return Response.json({ error: "Lineup ikke fundet" }, { status: 404, headers: CORS });
          }

          return Response.json(
            {
              league: resolvedLeague
                ? { id: resolvedLeague.id, name: resolvedLeague.name }
                : null,
              count: lineups.length,
              lineups,
            },
            { status: 200, headers: CORS },
          );
        } catch (e) {
          console.error("[broadcast/team-lineups]", e);
          return Response.json({ error: "Serverfejl" }, { status: 500, headers: CORS });
        }
      },
    },
  },
});
