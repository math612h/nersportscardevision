import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const toggleUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: "admin" | "racer"; assign: boolean }) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["admin", "racer"]), assign: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    // Verify caller is admin
    const { data: roleCheck, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) throw roleErr;
    if (!roleCheck) throw new Error("Unauthorized: only admins can manage roles");

    if (data.assign) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role })
        .single();
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw error;
    }
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    // Verify caller is admin
    const { data: roleCheck, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) throw roleErr;
    if (!roleCheck) throw new Error("Unauthorized: only admins can delete users");

    // Prevent self-deletion
    if (data.userId === callerId) {
      throw new Error("Du kan ikke slette din egen konto");
    }

    // Delete from Supabase Auth (cascades to profiles if FK is set up)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (authError) throw authError;

    return { ok: true };
  });
