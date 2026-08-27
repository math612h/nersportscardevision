import { createFileRoute } from "@tanstack/react-router";
import {
  BROADCAST_CLASSES,
  buildEntries,
  ICE_CUP_LEAGUE_NAME_MATCH,
  type RawEntry,
} from "@/lib/broadcast-ice-cup";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export const Route = createFileRoute("/api/public/broadcast/ice-cup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: league, error: lErr } = await supabaseAdmin
            .from("leagues")
            .select("id, name, published")
            .ilike("name", `%${ICE_CUP_LEAGUE_NAME_MATCH}%`)
            .eq("published", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lErr) throw lErr;
          if (!league) {
            return Response.json({ error: "ICE Cup ikke fundet" }, { status: 404, headers: CORS });
          }

          const { data: entryRows, error: eErr } = await supabaseAdmin
            .from("entries")
            .select("user_id, driver_name, car_number, car_class, driver_category, waitlist, team_id")
            .eq("league_id", league.id);
          if (eErr) throw eErr;
          const rows = (entryRows ?? []) as RawEntry[];

          const userIds = [...new Set(rows.map((r) => r.user_id))];
          const teamIds = [...new Set(rows.map((r) => r.team_id).filter(Boolean) as string[])];

          // Only non-private profile fields are selected.
          const { data: profiles } = userIds.length
            ? await supabaseAdmin
                .from("profiles")
                .select("id, display_name, lmu_name, avatar_url, discord_avatar_url, approved")
                .in("id", userIds)
            : { data: [] as any[] };

          const { data: teams } = teamIds.length
            ? await supabaseAdmin.from("teams").select("id, name").in("id", teamIds)
            : { data: [] as any[] };

          const approvedByUser = new Map<string, boolean>();
          const nameByUser = new Map<string, string>();
          const avatarByUser = new Map<string, string | null>();
          const needSigning: string[] = [];

          for (const p of profiles ?? []) {
            approvedByUser.set(p.id, !!p.approved);
            nameByUser.set(p.id, p.display_name || p.lmu_name || "");
            if (p.discord_avatar_url) avatarByUser.set(p.id, p.discord_avatar_url);
            else if (p.avatar_url) needSigning.push(p.id);
          }

          if (needSigning.length) {
            const origin = new URL(request.url).origin;
            for (const p of (profiles ?? []) as any[]) {
              if (needSigning.includes(p.id)) {
                avatarByUser.set(p.id, `${origin}/api/public/broadcast/storage/avatars/${p.avatar_url}`);
              }
            }
          }

          const teamNameById = new Map<string, string>();
          for (const t of teams ?? []) teamNameById.set(t.id, t.name);

          const entries = buildEntries(rows, {
            approvedByUser,
            nameByUser,
            avatarByUser,
            teamNameById,
          });

          const usedClasses = new Set(entries.map((e) => e.broadcastClass));

          return Response.json(
            {
              championship: { id: league.id, name: league.name },
              classes: BROADCAST_CLASSES.filter((c) => usedClasses.has(c.id)),
              entries,
            },
            { status: 200, headers: CORS },
          );
        } catch (e) {
          console.error("[broadcast/ice-cup]", e);
          return Response.json({ error: "Serverfejl" }, { status: 500, headers: CORS });
        }
      },
    },
  },
});
