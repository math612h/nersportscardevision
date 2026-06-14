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
