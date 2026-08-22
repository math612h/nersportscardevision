// Pure helpers for the public leaderboard broadcast endpoint.
// No database access here so the mapping logic can be unit-tested.

import { normalizePatch } from "@/lib/lmu-version";

export type RawLeaderboardTime = {
  user_id: string | null;
  driver_name: string | null;
  track: string;
  layout: string | null;
  car_class: string;
  car_model: string | null;
  best_lap_ms: number;
  recorded_at: string | null;
  created_at: string;
  game_version: string | null;
};

export type BroadcastBestLap = {
  track: string;
  layout: string | null;
  carClass: string;
  carModel: string | null;
  bestLapMs: number;
  bestLap: string;
  gameVersion: string | null;
  patch: string | null;
  currentPatch: boolean;
  recordedAt: string;
};

export type BroadcastLeaderboardDriver = {
  driverId: string;
  driverName: string;
  lmuName: string | null;
  avatarUrl: string | null;
  bests: BroadcastBestLap[];
};

/** ms → "m:ss.mmm" (fx 82662 → "1:22.662"). */
export function msToLap(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

/**
 * Grupperer rå leaderboard-rækker pr. kører og finder hurtigste tid
 * pr. (bane, layout, bilklasse). Kørere uden user_id udelades.
 */
export function groupBestLaps(
  rows: RawLeaderboardTime[],
  currentPatch: string | null,
  ctx: {
    nameByUser: Map<string, string>;
    lmuNameByUser: Map<string, string | null>;
    avatarByUser: Map<string, string | null>;
  },
): BroadcastLeaderboardDriver[] {
  const bestByDriver = new Map<string, Map<string, RawLeaderboardTime>>();

  for (const r of rows) {
    if (!r.user_id) continue;
    const key = `${r.track}|${r.layout ?? ""}|${r.car_class}`;
    let perDriver = bestByDriver.get(r.user_id);
    if (!perDriver) {
      perDriver = new Map();
      bestByDriver.set(r.user_id, perDriver);
    }
    const cur = perDriver.get(key);
    if (!cur || r.best_lap_ms < cur.best_lap_ms) perDriver.set(key, r);
  }

  const drivers: BroadcastLeaderboardDriver[] = [];
  for (const [userId, perKey] of bestByDriver) {
    const bests: BroadcastBestLap[] = Array.from(perKey.values()).map((r) => {
      const patch = normalizePatch(r.game_version);
      return {
        track: r.track,
        layout: r.layout,
        carClass: r.car_class,
        carModel: r.car_model,
        bestLapMs: r.best_lap_ms,
        bestLap: msToLap(r.best_lap_ms),
        gameVersion: r.game_version,
        patch,
        currentPatch: currentPatch != null && patch === currentPatch,
        recordedAt: r.recorded_at ?? r.created_at,
      };
    });
    bests.sort(
      (a, b) =>
        a.carClass.localeCompare(b.carClass) ||
        a.track.localeCompare(b.track) ||
        a.bestLapMs - b.bestLapMs,
    );
    drivers.push({
      driverId: userId,
      driverName:
        ctx.nameByUser.get(userId) ||
        perKey.values().next().value?.driver_name ||
        "",
      lmuName: ctx.lmuNameByUser.get(userId) ?? null,
      avatarUrl: ctx.avatarByUser.get(userId) ?? null,
      bests,
    });
  }
  drivers.sort((a, b) => a.driverName.localeCompare(b.driverName, "da"));
  return drivers;
}
