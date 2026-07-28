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

export type RatingHistoryRow = {
  recorded_at: string;
  score: number;
  delta: number | null;
  car_class: string | null;
};

export const getMyRatingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RatingHistoryRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("user_rating_history")
      .select("recorded_at,score,delta,car_class")
      .eq("user_id", context.userId)
      .order("recorded_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as RatingHistoryRow[];
  });

export const getMyArchive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const [{ data: timesData, error: tErr }, { data: resultsData, error: rErr }] = await Promise.all([
      supabaseAdmin
        .from("leaderboard_times")
        .select("track,layout,car_class,car_model,best_lap_ms,source,recorded_at,created_at,game_version")
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
      game_version: string | null;
    }>;

    // Beregn nyeste patch på tværs af ALLE brugere for at holde det konsistent med leaderboardet.
    const { data: allVersionsData } = await supabaseAdmin
      .from("leaderboard_times")
      .select("game_version")
      .not("game_version", "is", null);
    const normalize = (raw: string | null | undefined): string | null => {
      const v = (raw ?? "").trim();
      if (!v) return null;
      const parts = v.split(".");
      if (parts.length <= 2) return v;
      return parts.slice(0, -1).join(".");
    };
    const cmp = (a: string, b: string) => {
      const pa = a.split(".").map((n) => parseInt(n, 10));
      const pb = b.split(".").map((n) => parseInt(n, 10));
      const len = Math.max(pa.length, pb.length);
      for (let i = 0; i < len; i++) {
        const x = pa[i] ?? 0; const y = pb[i] ?? 0;
        if (x !== y) return y - x;
      }
      return 0;
    };
    const versionSet = new Set<string>();
    for (const r of (allVersionsData ?? []) as Array<{ game_version: string | null }>) {
      const v = normalize(r.game_version);
      if (v) versionSet.add(v);
    }
    const currentVersion = Array.from(versionSet).sort(cmp)[0] ?? null;
    const timesCurrent = currentVersion
      ? times.filter((t) => normalize(t.game_version) === currentVersion)
      : times;

    // Best per (track, layout, car_class) — kun fra nyeste patch
    const bestMap = new Map<string, ArchiveBestRow>();
    for (const t of timesCurrent) {
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

    // Historik viser alle patches (så udvikling over tid er komplet)
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
