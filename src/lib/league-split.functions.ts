import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  leagueId: z.string().uuid(),
  carClass: z.string().min(1),
});

export type SplitResult = {
  ok: true;
  total: number;
  proCount: number;
  amCount: number;
  proDrivers: Array<{ user_id: string; driver_name: string; score: number }>;
  amDrivers: Array<{ user_id: string; driver_name: string; score: number }>;
};

export const splitClassIntoProAm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }): Promise<SplitResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify caller is admin
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins kan opdele klasser.");

    // Fetch league
    const { data: league, error: lErr } = await supabaseAdmin
      .from("leagues")
      .select("id, class_configs")
      .eq("id", data.leagueId)
      .single();
    if (lErr) throw new Error(lErr.message);

    const configs: Array<{
      car_class: string;
      driver_category: string;
      number_from: number;
      number_to: number;
      max_drivers?: number;
      dns_limit?: number;
    }> = Array.isArray((league as any).class_configs) ? (league as any).class_configs : [];

    const targetConfigs = configs.filter((c) => c.car_class === data.carClass);
    if (targetConfigs.length !== 1) {
      throw new Error("Klassen skal have præcis én kategori for at kunne opdeles.");
    }
    const baseCfg = targetConfigs[0];

    // Fetch entries for league + car_class (not waitlist, league-level or division-level both fine)
    const { data: entries, error: eErr } = await supabaseAdmin
      .from("entries")
      .select("id, user_id, driver_name, car_class")
      .eq("league_id", data.leagueId)
      .eq("car_class", data.carClass)
      .eq("waitlist", false);
    if (eErr) throw new Error(eErr.message);
    const rows = (entries ?? []) as Array<{ id: string; user_id: string; driver_name: string }>;
    if (rows.length < 2) throw new Error("Mindst 2 kørere kræves for at opdele klassen.");

    const userIds = rows.map((r) => r.user_id);

    // ELO
    const { data: ratings } = await supabaseAdmin
      .from("user_ratings")
      .select("user_id, score")
      .in("user_id", userIds);
    const eloMap = new Map<string, number>();
    for (const r of (ratings ?? []) as Array<{ user_id: string; score: number }>) {
      eloMap.set(r.user_id, Number(r.score) || 1500);
    }

    // Leaderboard best lap per user in this car_class
    const { data: lbRows } = await supabaseAdmin
      .from("leaderboard_times")
      .select("user_id, best_lap_ms")
      .eq("car_class", data.carClass)
      .in("user_id", userIds);
    const bestMap = new Map<string, number>();
    for (const r of (lbRows ?? []) as Array<{ user_id: string; best_lap_ms: number }>) {
      const cur = bestMap.get(r.user_id);
      if (cur == null || r.best_lap_ms < cur) bestMap.set(r.user_id, r.best_lap_ms);
    }

    // Normalize: ELO 0..100 by percent-rank within field (higher = better)
    const elosSorted = [...userIds].map((u) => eloMap.get(u) ?? 1500).sort((a, b) => a - b);
    const eloNorm = (v: number) => {
      const n = elosSorted.length;
      if (n <= 1) return 50;
      const rank = elosSorted.findIndex((x) => x >= v);
      return (rank / (n - 1)) * 100;
    };

    // Leaderboard: faster = better. Normalize by median in the field.
    const lbValues = userIds
      .map((u) => bestMap.get(u))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    const median = lbValues.length > 0 ? lbValues[Math.floor(lbValues.length / 2)] : null;
    const lbNorm = (v: number | undefined) => {
      if (v == null || median == null || median <= 0) return 50;
      // 50 + 50*(median - v)/median, clamp 0..100
      const s = 50 + (50 * (median - v)) / median;
      return Math.max(0, Math.min(100, s));
    };

    // Compute weighted scores (70% ELO, 30% leaderboard)
    const scored = rows.map((r) => {
      const elo = eloMap.get(r.user_id) ?? 1500;
      const lb = bestMap.get(r.user_id);
      const score = 0.7 * eloNorm(elo) + 0.3 * lbNorm(lb);
      return { ...r, score, elo, lb };
    });

    // Sort desc
    scored.sort((a, b) => b.score - a.score);

    const n = scored.length;

    // Find optimal split index k (1..n-1):
    // total = 0.35 * balance + 0.65 * gap
    let bestK = Math.floor(n / 2);
    let bestTotal = -Infinity;
    const allGaps = scored
      .slice(0, -1)
      .map((s, i) => s.score - scored[i + 1].score);
    const maxGap = Math.max(...allGaps, 0.001);

    for (let k = 1; k <= n - 1; k++) {
      const balance = 1 - Math.abs(k - n / 2) / (n / 2); // 1 when k=n/2, 0 at edges
      const gap = (scored[k - 1].score - scored[k].score) / maxGap; // 0..1
      const total = 0.35 * balance + 0.65 * gap;
      if (total > bestTotal) {
        bestTotal = total;
        bestK = k;
      }
    }

    const pro = scored.slice(0, bestK);
    const am = scored.slice(bestK);

    // Update entries: set driver_category to Pro / Am
    const proIds = pro.map((p) => p.id);
    const amIds = am.map((p) => p.id);

    if (proIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("entries")
        .update({ driver_category: "Pro" })
        .in("id", proIds);
      if (error) throw new Error(error.message);
    }
    if (amIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("entries")
        .update({ driver_category: "Am" })
        .in("id", amIds);
      if (error) throw new Error(error.message);
    }

    // Update class_configs: replace the single config with two (Pro + Am)
    const newConfigs = configs.flatMap((c) => {
      if (c.car_class !== data.carClass) return [c];
      return [
        { ...c, driver_category: "Pro" },
        { ...c, driver_category: "Am" },
      ];
    });
    const { error: updErr } = await supabaseAdmin
      .from("leagues")
      .update({ class_configs: newConfigs as any })
      .eq("id", data.leagueId);
    if (updErr) throw new Error(updErr.message);

    return {
      ok: true,
      total: n,
      proCount: pro.length,
      amCount: am.length,
      proDrivers: pro.map((p) => ({ user_id: p.user_id, driver_name: p.driver_name, score: Math.round(p.score * 10) / 10 })),
      amDrivers: am.map((p) => ({ user_id: p.user_id, driver_name: p.driver_name, score: Math.round(p.score * 10) / 10 })),
    };
  });
