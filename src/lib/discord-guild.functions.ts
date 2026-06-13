import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkDiscordGuildMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isUserInGuild } = await import("./discord.server");

    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const discordUserId = (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;
    if (!discordUserId) {
      return { ok: false as const, reason: "not_linked" as const };
    }
    const res = await isUserInGuild(discordUserId);
    if (res.inGuild) return { ok: true as const };
    return { ok: false as const, reason: "not_member" as const, status: res.status };
  });
