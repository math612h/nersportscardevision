import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildAutomaticSplit, validateSplitAssignment, type SplitDriver } from "@/lib/league-split";

export type SplitResult = {
  ok: true;
  preview: boolean;
  total: number;
  proCount: number;
  amCount: number;
  proDrivers: SplitDriver[];
  amDrivers: SplitDriver[];
};

export const splitClassIntoProAm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    leagueId: z.string().uuid(),
    carClass: z.string().min(1),
    dryRun: z.boolean().optional(),
    proEntryIds: z.array(z.string().uuid()).optional(),
    amEntryIds: z.array(z.string().uuid()).optional(),
  }).parse(input))
  .handler(async ({ data, context }): Promise<SplitResult> => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((role) => role.role === "admin")) throw new Error("Kun admins kan opdele klasser.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    const { data: entries, error: eErr } = await supabaseAdmin
      .from("entries")
      .select("id, user_id, driver_name, car_class")
      .eq("league_id", data.leagueId)
      .eq("car_class", data.carClass)
      .eq("waitlist", false);
    if (eErr) throw new Error(eErr.message);
    const rows = (entries ?? []) as Array<{ id: string; user_id: string; driver_name: string }>;
    if (rows.length < 2) throw new Error("Mindst 2 kørere kræves for at opdele klassen.");

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: ratings } = await supabaseAdmin
      .from("user_class_ratings")
      .select("user_id, score, percentile, confidence, components")
      .eq("car_class", data.carClass)
      .in("user_id", userIds);
    const ratingMap = new Map(
      ((ratings ?? []) as Array<{
        user_id: string;
        score: number;
        percentile: number | null;
        confidence: number;
        components: { has_leaderboard_data?: boolean } | null;
      }>).map((r) => [r.user_id, r]),
    );
    const drivers: SplitDriver[] = rows.map((row) => {
      const rating = ratingMap.get(row.user_id);
      const hasRating = rating?.components?.has_leaderboard_data === true && Number(rating.confidence) > 0;
      return {
        entry_id: row.id,
        user_id: row.user_id,
        driver_name: row.driver_name,
        score: hasRating ? Number(rating.score) : null,
        percentile: hasRating && rating.percentile != null ? Number(rating.percentile) : null,
        hasRating,
      };
    });
    const automatic = buildAutomaticSplit(drivers);
    let pro = automatic.proDrivers;
    let am = automatic.amDrivers;

    if (!data.dryRun) {
      if (!data.proEntryIds || !data.amEntryIds) throw new Error("Den godkendte preview-fordeling mangler.");
      validateSplitAssignment(rows.map((r) => r.id), data.proEntryIds, data.amEntryIds);
      const byId = new Map(drivers.map((driver) => [driver.entry_id, driver]));
      pro = data.proEntryIds.map((id) => byId.get(id)).filter((driver): driver is SplitDriver => driver != null);
      am = data.amEntryIds.map((id) => byId.get(id)).filter((driver): driver is SplitDriver => driver != null);
    }

    // Update entries: set driver_category to Pro / Am
    const proIds = pro.map((p) => p.entry_id);
    const amIds = am.map((p) => p.entry_id);

    const buildResult = (preview: boolean): SplitResult => ({
      ok: true,
      preview,
      total: drivers.length,
      proCount: pro.length,
      amCount: am.length,
      proDrivers: pro,
      amDrivers: am,
    });

    if (data.dryRun) return buildResult(true);

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

    return buildResult(false);
  });
