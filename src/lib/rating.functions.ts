import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePatch, pickCurrentPatch } from "@/lib/lmu-version";

export const getCurrentPatch = createServerFn({ method: "GET" }).handler(async (): Promise<string | null> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const versions: Array<string | null> = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("leaderboard_times")
      .select("game_version")
      .not("game_version", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    versions.push(...((data ?? []) as Array<{ game_version: string | null }>).map((r) => r.game_version));
    if ((data?.length ?? 0) < pageSize) break;
  }

  return pickCurrentPatch(versions);
});

export type DriverSearchHit = {
  id: string | null;
  display_name: string | null;
  lmu_name: string | null;
  driver_name?: string | null;
};

export type DriverBestSourceRow = {
  id: string;
  track: string;
  layout: string | null;
  car_class: string;
  car_model: string | null;
  best_lap_ms: number;
  recorded_at: string | null;
  created_at: string;
  game_version: string | null;
};

export const searchLeaderboardDrivers = createServerFn({ method: "POST" })
  .inputValidator((input: { q: string }) => {
    const q = (input?.q ?? "").trim();
    if (q.length < 2) return { q: "" };
    return { q: q.slice(0, 80) };
  })
  .handler(async ({ data }): Promise<DriverSearchHit[]> => {
    if (!data.q) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const term = `%${data.q}%`;
    const [{ data: profData, error: profErr }, { data: lbData, error: lbErr }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, display_name, lmu_name")
        .or(`display_name.ilike.${term},lmu_name.ilike.${term}`)
        .limit(8),
      supabaseAdmin
        .from("leaderboard_times")
        .select("user_id, driver_name")
        .ilike("driver_name", term)
        .limit(200),
    ]);
    if (profErr) throw new Error(profErr.message);
    if (lbErr) throw new Error(lbErr.message);

    const results: DriverSearchHit[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    for (const p of (profData ?? []) as DriverSearchHit[]) {
      if (!p.id) continue;
      seenIds.add(p.id);
      results.push(p);
    }

    for (const row of (lbData ?? []) as Array<{ user_id: string | null; driver_name: string | null }>) {
      const driverName = (row.driver_name ?? "").trim();
      if (!driverName) continue;
      const nameKey = driverName.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);

      if (row.user_id) {
        if (seenIds.has(row.user_id)) continue;
        seenIds.add(row.user_id);
        results.push({ id: row.user_id, display_name: driverName, lmu_name: null, driver_name: driverName });
      } else {
        results.push({ id: null, display_name: null, lmu_name: null, driver_name: driverName });
      }
    }

    return results.slice(0, 12);
  });

export const getDriverLeaderboardRows = createServerFn({ method: "POST" })
  .inputValidator((input: { userId?: string | null; driverName?: string | null }) => ({
    userId: input?.userId ?? null,
    driverName: (input?.driverName ?? "").trim().slice(0, 120) || null,
  }))
  .handler(async ({ data }): Promise<DriverBestSourceRow[]> => {
    if (!data.userId && !data.driverName) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const select = "id,track,layout,car_class,car_model,best_lap_ms,recorded_at,created_at,game_version";
    const queries = [];

    if (data.userId) {
      queries.push(
        supabaseAdmin
          .from("leaderboard_times")
          .select(select)
          .eq("user_id", data.userId)
          .order("best_lap_ms", { ascending: true }),
      );
    }
    if (data.driverName) {
      queries.push(
        supabaseAdmin
          .from("leaderboard_times")
          .select(select)
          .ilike("driver_name", data.driverName)
          .order("best_lap_ms", { ascending: true }),
      );
    }

    const responses = await Promise.all(queries);
    const byId = new Map<string, DriverBestSourceRow>();
    for (const res of responses) {
      if (res.error) throw new Error(res.error.message);
      for (const row of (res.data ?? []) as DriverBestSourceRow[]) byId.set(row.id, row);
    }
    return Array.from(byId.values()).sort((a, b) => a.best_lap_ms - b.best_lap_ms);
  });

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

    // Beregn nyeste patch globalt (major.minor). Hotfixes tæller som samme patch.
    const versions: Array<string | null> = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: allVersionsData, error: allVersionsError } = await supabaseAdmin
        .from("leaderboard_times")
        .select("game_version")
        .not("game_version", "is", null)
        .range(from, from + pageSize - 1);
      if (allVersionsError) throw new Error(allVersionsError.message);
      versions.push(...((allVersionsData ?? []) as Array<{ game_version: string | null }>).map((r) => r.game_version));
      if ((allVersionsData?.length ?? 0) < pageSize) break;
    }
    const currentVersion = pickCurrentPatch(versions);
    const timesCurrent = currentVersion
      ? times.filter((t) => normalizePatch(t.game_version) === currentVersion)
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
