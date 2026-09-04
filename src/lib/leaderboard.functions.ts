import { createServerFn } from "@tanstack/react-start";

export type LeaderboardRow = {
  id: string;
  user_id: string | null;
  driver_name: string;
  track: string;
  layout: string | null;
  car_class: string;
  car_model: string | null;
  best_lap_ms: number;
  source: "admin" | "user" | "league";
  recorded_at: string | null;
  created_at: string;
  game_version: string | null;
};

const PAGE_SIZE = 1000;

// Leaderboardet er ens for alle besøgende og ændrer sig kun når nogen uploader
// en ny tid. Uden cache laver hver sidevisning ~35 fulde tabel-scanninger, hvilket
// er det, der lægger databasen ned ved mange samtidige brugere.
const CACHE_TTL_MS = 60_000;
let cache: { rows: LeaderboardRow[]; at: number } | undefined;
let inflight: Promise<LeaderboardRow[]> | undefined;

/** Ryd cachen, fx efter en upload, så nye tider vises med det samme. */
export function invalidateLeaderboardCache() {
  cache = undefined;
}

async function loadAll(): Promise<LeaderboardRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const allRows: LeaderboardRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("leaderboard_times")
      .select("id,user_id,driver_name,track,layout,car_class,car_model,best_lap_ms,source,recorded_at,created_at,game_version")
      .order("best_lap_ms", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    allRows.push(...((data ?? []) as LeaderboardRow[]));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }

  return allRows;
}

export const getLeaderboardRows = createServerFn({ method: "GET" }).handler(async (): Promise<LeaderboardRow[]> => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  // Sammenfald af samtidige forespørgsler deler ét databasekald.
  if (!inflight) {
    inflight = loadAll()
      .then((rows) => {
        cache = { rows, at: Date.now() };
        return rows;
      })
      .catch((err) => {
        // Ved fx timeout serverer vi hellere lidt gamle data end en fejlside.
        if (cache) return cache.rows;
        throw err;
      })
      .finally(() => {
        inflight = undefined;
      });
  }
  return inflight;
});
