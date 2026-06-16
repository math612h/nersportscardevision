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
};

const PAGE_SIZE = 1000;

export const getLeaderboardRows = createServerFn({ method: "GET" }).handler(async (): Promise<LeaderboardRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const allRows: LeaderboardRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("leaderboard_times")
      .select("id,user_id,driver_name,track,layout,car_class,car_model,best_lap_ms,source,recorded_at,created_at")
      .order("best_lap_ms", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    allRows.push(...((data ?? []) as LeaderboardRow[]));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }

  return allRows;
});