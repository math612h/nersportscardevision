import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const refreshPendingDiscordNicknames = createServerFn({ method: "POST" })
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
    if (!isAdmin) return { ok: false as const, error: "Kun admin" };

    // Find pending (not approved) users with a linked Discord account
    const { data: pending } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("approved", false);
    const ids = (pending ?? []).map((p: { id: string }) => p.id);
    if (ids.length === 0) return { ok: true as const, updated: 0, checked: 0 };

    const { data: privs } = await supabaseAdmin
      .from("profiles_private")
      .select("user_id, discord_user_id, discord_server_nickname")
      .in("user_id", ids)
      .not("discord_user_id", "is", null);

    let updated = 0;
    let checked = 0;
    for (const row of (privs ?? []) as {
      user_id: string;
      discord_user_id: string;
      discord_server_nickname: string | null;
    }[]) {
      checked++;
      try {
        const member = await fetchDiscordGuildMember(row.discord_user_id);
        if (member && (member.nick ?? null) !== (row.discord_server_nickname ?? null)) {
          await supabaseAdmin
            .from("profiles_private")
            .update({ discord_server_nickname: member.nick })
            .eq("user_id", row.user_id);
          updated++;
        }
      } catch {
        // ignore
      }
    }
    return { ok: true as const, updated, checked };
  });
