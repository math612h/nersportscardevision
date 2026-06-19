import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Strips the "Medlem" role from every guild member who is NOT a registered
// AND approved user on the website. The only way to keep the role is to
// have a website profile, with Discord linked, AND be approved by an admin.
// Everyone else — onboarding leftovers, bot-assigned, unapproved, deleted
// accounts — gets the role removed and must go through #velkomst again.
export async function stripUnverifiedMembersImpl(): Promise<{
  scanned: number;
  stripped: number;
  errors: string[];
}> {
  const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID;
  if (!memberRoleId) throw new Error("DISCORD_MEMBER_ROLE_ID mangler.");

  const { listGuildMemberIdsWithRole, removeGuildRole } = await import("./discord.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const ids = await listGuildMemberIdsWithRole(memberRoleId);

  // Build the allow-list: Discord user IDs that map to an approved profile.
  const allowed = new Set<string>();
  if (ids.length > 0) {
    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("user_id, discord_user_id")
      .in("discord_user_id", ids);
    const rows = (priv ?? []) as { user_id: string; discord_user_id: string | null }[];
    const userIds = rows.map((r) => r.user_id);
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, approved")
        .in("id", userIds);
      const approvedIds = new Set(
        ((profs ?? []) as { id: string; approved: boolean | null }[])
          .filter((p) => p.approved === true)
          .map((p) => p.id),
      );
      for (const r of rows) {
        if (r.discord_user_id && approvedIds.has(r.user_id)) {
          allowed.add(r.discord_user_id);
        }
      }
    }
  }

  let stripped = 0;
  const errors: string[] = [];

  for (const id of ids) {
    if (allowed.has(id)) continue;
    try {
      const res = await removeGuildRole(id, memberRoleId);
      if (res.ok) stripped++;
      else errors.push(`${id}: ${res.status} ${res.message ?? ""}`);
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message}`);
    }
  }

  return { scanned: ids.length, stripped, errors: errors.slice(0, 20) };
}

export const stripUnverifiedMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins.");
    return await stripUnverifiedMembersImpl();
  });
