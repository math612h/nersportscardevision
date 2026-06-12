import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  display_name: z.string().trim().min(1).max(80),
  lmu_name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
});

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Must have Discord linked first
    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const discordId = (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;
    if (!discordId) throw new Error("Du skal tilknytte Discord først.");

    // Update auth email if it differs
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const currentEmail = userRes.user?.email ?? "";
    if (currentEmail.toLowerCase() !== data.email.toLowerCase()) {
      const { error: emailErr } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        email: data.email,
        email_confirm: true,
      });
      if (emailErr) throw new Error(emailErr.message);
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        display_name: data.display_name,
        lmu_name: data.lmu_name,
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
