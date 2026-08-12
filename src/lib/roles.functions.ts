import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["admin", "racer", "guest", "coach", "steward"] as const;
export type AppRole = (typeof ROLES)[number];

async function assertAdmin(supabase: any, callerId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Kun administratorer kan administrere roller");
}

export const adminListRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roleRows, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at");
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, display_name, avatar_url").in("id", ids)
      : { data: [] as any[] };

    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return ROLES.map((role) => ({
      role,
      users: (roleRows ?? [])
        .filter((r) => r.role === role)
        .map((r) => ({
          id: r.user_id,
          display_name: map.get(r.user_id)?.display_name ?? "Ukendt bruger",
          avatar_url: map.get(r.user_id)?.avatar_url ?? null,
          created_at: r.created_at,
        }))
        .sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "")),
    }));
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ userId: z.string().uuid(), role: z.enum(ROLES), assign: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.role === "admin" && !data.assign && data.userId === context.userId) {
      throw new Error("Du kan ikke fjerne din egen admin-rolle");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.assign) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
