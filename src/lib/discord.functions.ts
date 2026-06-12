import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CANONICAL_ORIGIN = "https://lmudanmark.dk";

export const startDiscordLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { signDiscordState, buildDiscordAuthUrl } = await import("./discord.server");
    const state = await signDiscordState(context.userId);
    return { url: buildDiscordAuthUrl(state, originFromRequest()) };
  });

export const unlinkDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles_private")
      .upsert(
        {
          user_id: context.userId,
          discord_user_id: null,
          discord_username: null,
          discord_linked_at: null,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignDiscordRoleForEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leagueId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { addGuildRole } = await import("./discord.server");

    const { data: league } = await supabaseAdmin
      .from("leagues")
      .select("discord_role_id")
      .eq("id", data.leagueId)
      .maybeSingle();
    const roleId = (league as { discord_role_id?: string | null } | null)?.discord_role_id ?? null;
    if (!roleId) return { ok: false, reason: "no_role" as const };

    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const discordUserId = (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;
    if (!discordUserId) return { ok: false, reason: "not_linked" as const };

    const res = await addGuildRole(discordUserId, roleId);
    if (!res.ok) {
      console.error("Discord role assign failed", res);
      return { ok: false, reason: "api_error" as const, status: res.status, message: res.message };
    }
    return { ok: true };
  });

export const removeDiscordRoleForEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leagueId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { removeGuildRole } = await import("./discord.server");

    const { data: league } = await supabaseAdmin
      .from("leagues")
      .select("discord_role_id")
      .eq("id", data.leagueId)
      .maybeSingle();
    const roleId = (league as { discord_role_id?: string | null } | null)?.discord_role_id ?? null;
    if (!roleId) return { ok: false, reason: "no_role" as const };

    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const discordUserId = (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;
    if (!discordUserId) return { ok: false, reason: "not_linked" as const };

    const res = await removeGuildRole(discordUserId, roleId);
    if (!res.ok) {
      console.error("Discord role remove failed", res);
      return { ok: false, reason: "api_error" as const, status: res.status, message: res.message };
    }
    return { ok: true };
  });
