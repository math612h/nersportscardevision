import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .inputValidator((input) => z.object({ leagueId: z.string().uuid(), carClass: z.string().min(1) }).parse(input))
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

    // Brug samme klassespecifikke rating som ved den oprindelige Pro/Am-opdeling.
    const scoreFor = async (ids: string[]) => {
      const out = new Map<string, number | null>();
      if (ids.length === 0) return out;
      const { data: ratings } = await supabaseAdmin
        .from("user_class_ratings")
        .select("user_id, score, confidence, components")
        .eq("car_class", data.carClass)
        .in("user_id", ids);
      for (const id of ids) out.set(id, null);
      for (const r of (ratings ?? []) as Array<{
        user_id: string;
        score: number;
        confidence: number;
        components: { has_leaderboard_data?: boolean } | null;
      }>) {
        if (r.components?.has_leaderboard_data === true && Number(r.confidence) > 0) {
          out.set(r.user_id, Number(r.score));
        }
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

    const mine = stats.get(userId) ?? null;

    // Find "hurtigste" kategori-navn (Pro) og den langsomme (Am) heuristisk
    const proName = cats.find((c) => /pro/i.test(c)) ?? cats[0];
    const amName = cats.find((c) => c !== proName) ?? cats[cats.length - 1];

    const byCat = new Map<string, number[]>();
    for (const r of rows) {
      if (!byCat.has(r.driver_category)) byCat.set(r.driver_category, []);
      const score = stats.get(r.user_id);
      if (score != null) byCat.get(r.driver_category)?.push(score);
    }
    const avg = (arr?: number[]) =>
      arr && arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const proAvg = avg(byCat.get(proName));
    const amAvg = avg(byCat.get(amName));

    if (mine != null && proAvg != null && amAvg != null) {
      const mid = (proAvg + amAvg) / 2;
      const category = mine >= mid ? proName : amName;
      return { category, reason: "Placeret ud fra din klassespecifikke rating i forhold til feltet." };
    }

    if (mine != null && (proAvg != null || amAvg != null)) {
      const ref = proAvg ?? amAvg;
      if (ref == null) return { category: amName, reason: "Ingen klassespecifik rating endnu." };
      const refCat = proAvg != null ? proName : amName;
      const otherCat = refCat === proName ? amName : proName;
      const faster = mine >= ref;
      const category = refCat === proName ? (faster ? proName : otherCat) : faster ? otherCat : refCat;
      return { category, reason: "Placeret ud fra din rating i forhold til de allerede tilmeldte." };
    }

    // Ingen brugbar felt-reference endnu — brug klassens percentil.
    const { data: myRating } = await supabaseAdmin
      .from("user_class_ratings")
      .select("percentile, components")
      .eq("user_id", userId)
      .eq("car_class", data.carClass)
      .maybeSingle();
    const ratingComponents = (myRating as { components?: { has_leaderboard_data?: boolean } | null } | null)?.components;
    const pct = ratingComponents?.has_leaderboard_data === true
      ? (myRating as { percentile?: number | null } | null)?.percentile
      : null;
    const category = pct != null && Number(pct) >= 50 ? proName : amName;
    return { category, reason: pct == null ? "Ingen klassespecifik rating endnu." : "Placeret ud fra din rating i bilklassen." };
  });
