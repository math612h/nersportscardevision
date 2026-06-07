import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AllowedResult = {
  allowed: string[];
  reason: "algorithm" | "insufficient_data" | "single_category" | "no_categories";
  user_score: number;
  reasoning?: Record<string, { count: number; median: number | null }>;
};

export const getAllowedCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leagueId: string; carClass: string }) => d)
  .handler(async ({ data, context }): Promise<AllowedResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("allowed_categories_for_signup", {
      _user_id: context.userId,
      _league_id: data.leagueId,
      _car_class: data.carClass,
    } as never);
    if (error) throw new Error(error.message);
    const j = (res ?? {}) as Record<string, unknown>;
    return {
      allowed: ((j.allowed as string[] | undefined) ?? []),
      reason: (j.reason as AllowedResult["reason"]) ?? "insufficient_data",
      user_score: Number(j.user_score ?? 50),
      reasoning: (j.reasoning as AllowedResult["reasoning"]) ?? undefined,
    };
  });

export type ArchiveBestRow = {
  track: string;
  layout: string | null;
  car_class: string;
  car_model: string | null;
  best_lap_ms: number;
  source: string;
  recorded_at: string | null;
};

export type ArchiveLeagueRow = {
  id: string;
  league_id: string;
  league_name: string;
  round: number | null;
  track: string;
  car_class: string;
  best_lap_ms: number | null;
  position: number | null;
  points: number | null;
  created_at: string;
};

export type ArchiveHistoryRow = {
  recorded_at: string;
  track: string;
  car_class: string;
  best_lap_ms: number;
  source: string;
};

export const getMyArchive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const [{ data: timesData, error: tErr }, { data: resultsData, error: rErr }] = await Promise.all([
      supabaseAdmin
        .from("leaderboard_times")
        .select("track,layout,car_class,car_model,best_lap_ms,source,recorded_at,created_at")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: true }),
      supabaseAdmin
        .from("league_results")
        .select("id,league_id,round,track,car_class,best_lap_ms,position,points,created_at,leagues(name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    if (tErr) throw new Error(tErr.message);
    if (rErr) throw new Error(rErr.message);

    const times = (timesData ?? []) as Array<{
      track: string; layout: string | null; car_class: string; car_model: string | null;
      best_lap_ms: number; source: string; recorded_at: string | null; created_at: string;
    }>;

    // Best per (track, layout, car_class)
    const bestMap = new Map<string, ArchiveBestRow>();
    for (const t of times) {
      const key = `${t.track}|${t.layout ?? ""}|${t.car_class}`;
      const cur = bestMap.get(key);
      if (!cur || t.best_lap_ms < cur.best_lap_ms) {
        bestMap.set(key, {
          track: t.track, layout: t.layout, car_class: t.car_class, car_model: t.car_model,
          best_lap_ms: t.best_lap_ms, source: t.source,
          recorded_at: t.recorded_at ?? t.created_at,
        });
      }
    }

    const best = Array.from(bestMap.values()).sort((a, b) =>
      a.car_class.localeCompare(b.car_class) || a.track.localeCompare(b.track),
    );

    const history: ArchiveHistoryRow[] = times.map((t) => ({
      recorded_at: t.recorded_at ?? t.created_at,
      track: t.track,
      car_class: t.car_class,
      best_lap_ms: t.best_lap_ms,
      source: t.source,
    }));

    const leagueRows: ArchiveLeagueRow[] = ((resultsData ?? []) as any[]).map((r) => ({
      id: r.id,
      league_id: r.league_id,
      league_name: r.leagues?.name ?? "—",
      round: r.round,
      track: r.track,
      car_class: r.car_class,
      best_lap_ms: r.best_lap_ms,
      position: r.position,
      points: r.points,
      created_at: r.created_at,
    }));

    return { best, history, leagueResults: leagueRows };
  });
