import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Kun admins.");
}

const searchSchema = z.object({ q: z.string().min(1).max(80) });

export type UserSearchHit = {
  id: string;
  display_name: string | null;
  lmu_name: string | null;
  approved: boolean;
};

export const searchUsersForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => searchSchema.parse(d))
  .handler(async ({ data, context }): Promise<UserSearchHit[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.trim();
    const like = `%${q}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, lmu_name, approved")
      .or(`display_name.ilike.${like},lmu_name.ilike.${like}`)
      .limit(20);
    if (error) throw new Error(error.message);
    return (rows ?? []) as UserSearchHit[];
  });

const addSchema = z.object({
  leagueId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  carClass: z.string().min(1),
  driverCategory: z.string().min(1),
  carNumber: z.number().int().positive().nullable(),
  teamId: z.string().uuid().nullable().optional(),
  carModel: z.string().nullable().optional(),
});

export const adminAddEntryToLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => addSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch profile for driver_name
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", data.targetUserId)
      .single();
    if (pErr) throw new Error(pErr.message);
    const driverName = ((profile as { display_name: string | null }).display_name ?? "").trim();
    if (!driverName) throw new Error("Brugeren mangler et visningsnavn på profilen.");

    // Insert (via service role → triggers auth.uid() check returns NULL → 10-times rule skipped)
    const { error: insErr } = await supabaseAdmin.from("entries").insert({
      league_id: data.leagueId,
      user_id: data.targetUserId,
      driver_name: driverName,
      car_class: data.carClass,
      driver_category: data.driverCategory,
      car_number: data.carNumber,
      waitlist: false,
      team_id: data.teamId ?? null,
      car_model: data.carModel ?? null,
    } as any);
    if (insErr) throw new Error(insErr.message);

    return { ok: true };
  });

/**
 * Re-balance the league's waitlist against the current class_configs capacities.
 * For each (car_class, driver_category) with a max_drivers cap, entries are sorted
 * by created_at ascending. The first N approved entries go on the grid, the rest to waitlist.
 * Non-approved profiles are kept on waitlist.
 */
export const rebalanceLeagueWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leagueId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: league, error: lErr } = await supabaseAdmin
      .from("leagues")
      .select("class_configs")
      .eq("id", data.leagueId)
      .single();
    if (lErr) throw new Error(lErr.message);
    const configs: Array<{ car_class: string; driver_category: string; max_drivers?: number | null }> =
      Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];

    const { data: entries, error: eErr } = await supabaseAdmin
      .from("entries")
      .select("id,user_id,car_class,driver_category,waitlist,created_at")
      .eq("league_id", data.leagueId)
      .order("created_at", { ascending: true });
    if (eErr) throw new Error(eErr.message);

    const userIds = Array.from(new Set((entries ?? []).map((e: any) => e.user_id).filter(Boolean)));
    let approvedMap = new Map<string, boolean>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,approved")
        .in("id", userIds);
      approvedMap = new Map((profiles ?? []).map((p: any) => [p.id, !!p.approved]));
    }

    let promoted = 0;
    for (const cfg of configs) {
      const cap = cfg.max_drivers ?? null;
      if (cap == null) continue;
      const group = (entries ?? []).filter(
        (e: any) => e.car_class === cfg.car_class && e.driver_category === cfg.driver_category,
      );
      let onGrid = 0;
      for (const e of group as any[]) {
        const approved = approvedMap.get(e.user_id) ?? false;
        const shouldBeOnGrid = approved && onGrid < cap;
        if (shouldBeOnGrid) onGrid += 1;
        const desiredWaitlist = !shouldBeOnGrid;
        if (desiredWaitlist !== !!e.waitlist) {
          await supabaseAdmin.from("entries").update({ waitlist: desiredWaitlist }).eq("id", e.id);
          if (!desiredWaitlist) promoted += 1;
        }
      }
    }

    return { ok: true, promoted };
  });

/**
 * Manually flip a waitlist entry to the grid (admin override — capacity is NOT enforced).
 */
export const adminPromoteWaitlistEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("entries")
      .update({ waitlist: false })
      .eq("id", data.entryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
