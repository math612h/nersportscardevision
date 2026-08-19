import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  leagueId: z.string().uuid(),
  carClass: z.string().min(1),
  targetCategory: z.enum(["Pro", "Am", "Open"]).optional(),
});

export type MergeResult = { ok: true; moved: number; category: string };

export const mergeClassCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }): Promise<MergeResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
      throw new Error("Kun admins kan samle klasser.");
    }

    const category = data.targetCategory ?? "Open";

    const { data: league, error: lErr } = await supabaseAdmin
      .from("leagues")
      .select("id, class_configs")
      .eq("id", data.leagueId)
      .single();
    if (lErr) throw new Error(lErr.message);

    const configs: Array<Record<string, any>> = Array.isArray((league as any).class_configs)
      ? (league as any).class_configs
      : [];

    const targets = configs.filter((c) => c.car_class === data.carClass);
    if (targets.length < 2) throw new Error("Klassen er ikke opdelt.");

    // Merge configs: keep widest number range and the largest cap
    const merged = {
      ...targets[0],
      driver_category: category,
      number_from: Math.min(...targets.map((c) => Number(c.number_from) || 0)),
      number_to: Math.max(...targets.map((c) => Number(c.number_to) || 0)),
      max_drivers: targets
        .map((c) => (typeof c.max_drivers === "number" ? c.max_drivers : null))
        .reduce<number | null>((a, b) => (a == null || b == null ? a ?? b : Math.max(a, b)), null),
    };

    let seen = false;
    const newConfigs = configs.flatMap((c) => {
      if (c.car_class !== data.carClass) return [c];
      if (seen) return [];
      seen = true;
      return [merged];
    });

    const { data: updated, error: eErr } = await supabaseAdmin
      .from("entries")
      .update({ driver_category: category })
      .eq("league_id", data.leagueId)
      .eq("car_class", data.carClass)
      .select("id");
    if (eErr) throw new Error(eErr.message);

    const { error: updErr } = await supabaseAdmin
      .from("leagues")
      .update({ class_configs: newConfigs as any })
      .eq("id", data.leagueId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, moved: (updated ?? []).length, category };
  });
