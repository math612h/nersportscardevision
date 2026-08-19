import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  leagueId: z.string().uuid(),
  carClass: z.string().min(1),
});

export type SuggestedCategory = {
  category: string | null;
  reason: string;
};

/**
 * Foreslår en driver_category (fx Pro/Am) til en kører i en given liga+bilklasse.
 * Brugeren kan ikke selv vælge kategori når klassen er opdelt.
 */
export const suggestSignupCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }): Promise<SuggestedCategory> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: league, error: lErr } = await supabaseAdmin
      .from("leagues")
      .select("id, class_configs")
      .eq("id", data.leagueId)
      .single();
    if (lErr) throw new Error(lErr.message);

    const configs: Array<{ car_class: string; driver_category: string }> = Array.isArray(
      (league as any).class_configs,
    )
      ? ((league as any).class_configs as any[])
      : [];
    const cats = Array.from(
      new Set(
        configs
          .filter((c) => c.car_class === data.carClass)
          .map((c) => c.driver_category)
          .filter(Boolean),
      ),
    );
    if (cats.length === 0) return { category: null, reason: "Ingen kategorier fundet." };
    if (cats.length === 1) return { category: cats[0], reason: "Klassen har kun én kategori." };

    // Score helper: 70% ELO + 30% bedste omgangstid i klassen
    const scoreFor = async (ids: string[]) => {
      const out = new Map<string, { elo: number; lap: number | null }>();
      if (ids.length === 0) return out;
      const { data: ratings } = await supabaseAdmin
        .from("user_ratings")
        .select("user_id, score")
        .in("user_id", ids);
      const { data: laps } = await supabaseAdmin
        .from("leaderboard_times")
        .select("user_id, best_lap_ms")
        .eq("car_class", data.carClass)
        .in("user_id", ids);
      for (const id of ids) out.set(id, { elo: 1500, lap: null });
      for (const r of (ratings ?? []) as Array<{ user_id: string; score: number }>) {
        out.set(r.user_id, { ...(out.get(r.user_id) ?? { elo: 1500, lap: null }), elo: Number(r.score) || 1500 });
      }
      for (const r of (laps ?? []) as Array<{ user_id: string; best_lap_ms: number }>) {
        const cur = out.get(r.user_id) ?? { elo: 1500, lap: null };
        if (cur.lap == null || r.best_lap_ms < cur.lap) out.set(r.user_id, { ...cur, lap: r.best_lap_ms });
      }
      return out;
    };

    // Eksisterende tilmeldte i klassen
    const { data: entries } = await supabaseAdmin
      .from("entries")
      .select("user_id, driver_category")
      .eq("league_id", data.leagueId)
      .eq("car_class", data.carClass);
    const rows = ((entries ?? []) as Array<{ user_id: string; driver_category: string }>).filter(
      (r) => r.user_id !== userId,
    );

    const allIds = Array.from(new Set([userId, ...rows.map((r) => r.user_id)]));
    const stats = await scoreFor(allIds);

    const laps = allIds.map((id) => stats.get(id)?.lap).filter((v): v is number => v != null);
    const median = laps.length > 0 ? [...laps].sort((a, b) => a - b)[Math.floor(laps.length / 2)] : null;
    const composite = (id: string) => {
      const s = stats.get(id) ?? { elo: 1500, lap: null };
      const eloPart = s.elo;
      const lapPart =
        s.lap != null && median != null && median > 0 ? 1500 + ((median - s.lap) / median) * 1500 : 1500;
      return 0.7 * eloPart + 0.3 * lapPart;
    };

    const mine = composite(userId);

    // Find "hurtigste" kategori-navn (Pro) og den langsomme (Am) heuristisk
    const proName = cats.find((c) => /pro/i.test(c)) ?? cats[0];
    const amName = cats.find((c) => c !== proName) ?? cats[cats.length - 1];

    const byCat = new Map<string, number[]>();
    for (const r of rows) {
      if (!byCat.has(r.driver_category)) byCat.set(r.driver_category, []);
      byCat.get(r.driver_category)!.push(composite(r.user_id));
    }
    const avg = (arr?: number[]) =>
      arr && arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const proAvg = avg(byCat.get(proName));
    const amAvg = avg(byCat.get(amName));

    if (proAvg != null && amAvg != null) {
      const mid = (proAvg + amAvg) / 2;
      const category = mine >= mid ? proName : amName;
      return { category, reason: "Placeret ud fra din rating og omgangstider i forhold til feltet." };
    }

    if (proAvg != null || amAvg != null) {
      const ref = (proAvg ?? amAvg)!;
      const refCat = proAvg != null ? proName : amName;
      const otherCat = refCat === proName ? amName : proName;
      const faster = mine >= ref;
      const category = refCat === proName ? (faster ? proName : otherCat) : faster ? otherCat : refCat;
      return { category, reason: "Placeret ud fra din rating i forhold til de allerede tilmeldte." };
    }

    // Ingen tilmeldte endnu — brug global percentil
    const { data: myRating } = await supabaseAdmin
      .from("user_ratings")
      .select("percentile")
      .eq("user_id", userId)
      .maybeSingle();
    const pct = (myRating as any)?.percentile;
    const category = pct != null && Number(pct) >= 50 ? proName : amName;
    return { category, reason: "Placeret ud fra din samlede rating." };
  });
