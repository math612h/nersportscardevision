import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

const bulkSchema = z.object({ userIds: z.array(z.string().uuid()).max(200) });

export type GuildMembershipStatus =
  | { user_id: string; status: "not_linked" }
  | { user_id: string; status: "in_guild" }
  | { user_id: string; status: "not_member" }
  | { user_id: string; status: "error"; httpStatus?: number };

export const checkPendingGuildMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => bulkSchema.parse(i))
  .handler(async ({ data, context }): Promise<GuildMembershipStatus[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isUserInGuild } = await import("./discord.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins.");
    if (data.userIds.length === 0) return [];

    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("user_id, discord_user_id")
      .in("user_id", data.userIds);

    const map = new Map<string, string | null>();
    for (const id of data.userIds) map.set(id, null);
    for (const row of (priv ?? []) as { user_id: string; discord_user_id?: string | null }[]) {
      map.set(row.user_id, row.discord_user_id ?? null);
    }

    const results: GuildMembershipStatus[] = [];
    for (const [user_id, discordId] of map.entries()) {
      if (!discordId) {
        results.push({ user_id, status: "not_linked" });
        continue;
      }
      try {
        const r = await isUserInGuild(discordId);
        if (r.inGuild) results.push({ user_id, status: "in_guild" });
        else if (r.status === 404) results.push({ user_id, status: "not_member" });
        else results.push({ user_id, status: "error", httpStatus: r.status });
      } catch {
        results.push({ user_id, status: "error" });
      }
    }
    return results;
  });
