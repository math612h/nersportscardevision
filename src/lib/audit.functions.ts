import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Filters = z.object({
  table: z.string().optional(),
  actorId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Kun admins");
}

export const getAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Filters.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("audit_log")
      .select("id, action, table_name, row_id, actor_id, actor_label, old_data, new_data, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.table) q = q.eq("table_name", data.table);
    if (data.actorId) q = q.eq("actor_id", data.actorId);
    if (data.search) q = q.or(`actor_label.ilike.%${data.search}%,row_id.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getAuditTables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Simple distinct via SQL
    const { data: rows } = await supabaseAdmin
      .from("audit_log")
      .select("table_name")
      .limit(1000);
    const set = new Set<string>();
    (rows ?? []).forEach((r: any) => set.add(r.table_name));
    return Array.from(set).sort();
  });
