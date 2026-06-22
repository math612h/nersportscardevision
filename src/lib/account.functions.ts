import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sletter den aktuelle brugers konto + alle data der er knyttet til den.
 * Bruger Supabase Admin API til at slette auth.users-rækken — alle relaterede
 * rækker forsvinder via ON DELETE CASCADE foreign keys (profiles,
 * profiles_private, entries, league_results, user_ratings, m.fl.).
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
