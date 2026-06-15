import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const backfillDiscordServerNicknames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchDiscordGuildMember } = await import("./discord.server");

    // Verify admin
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) return { ok: false, error: "Kun admin" };

    const { data: privs } = await supabaseAdmin
      .from("profiles_private")
      .select("user_id, discord_user_id")
      .not("discord_user_id", "is", null);

    let updated = 0;
    let failed = 0;

    for (const row of (privs ?? []) as { user_id: string; discord_user_id: string }[]) {
      try {
        const member = await fetchDiscordGuildMember(row.discord_user_id);
        if (member) {
          await supabaseAdmin
            .from("profiles_private")
            .update({ discord_server_nickname: member.nick })
            .eq("user_id", row.user_id);
          updated++;
        }
      } catch {
        failed++;
      }
    }

    return { ok: true, updated, failed, total: (privs ?? []).length };
  });
