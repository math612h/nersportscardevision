import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const refreshMyDiscordAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchDiscordUserAvatar } = await import("./discord.server");

    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const did = (priv as { discord_user_id?: string | null } | null)?.discord_user_id;
    if (!did) return { ok: false as const, reason: "not_linked" as const };

    const url = await fetchDiscordUserAvatar(did);
    if (!url) return { ok: false as const, reason: "no_avatar" as const };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ discord_avatar_url: url })
      .eq("id", context.userId);
    if (error) return { ok: false as const, reason: "db_error" as const, error: error.message };
    return { ok: true as const, url };
  });
