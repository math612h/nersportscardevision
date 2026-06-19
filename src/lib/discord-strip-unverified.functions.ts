import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Strips the "Medlem" role from guild members who have it but have NOT
// completed the welcome flow (i.e. their server nickname is empty).
// The welcome modal always sets a nickname of "Firstname Lastname" — so a
// member with the role but no nickname must have received the role from an
// automatic source (Discord onboarding, an external bot, a server template,
// etc.) and should be sent back through the welcome flow.
export async function stripUnverifiedMembersImpl(): Promise<{
  scanned: number;
  stripped: number;
  errors: string[];
}> {
  const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID;
  if (!memberRoleId) throw new Error("DISCORD_MEMBER_ROLE_ID mangler.");

  const { listGuildMemberIdsWithRole, fetchDiscordGuildMember, removeGuildRole } =
    await import("./discord.server");

  const ids = await listGuildMemberIdsWithRole(memberRoleId);

  let stripped = 0;
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const member = await fetchDiscordGuildMember(id);
      const nick = (member?.nick ?? "").trim();
      // Completed flow → nickname is set ("Firstname Lastname"). Skip.
      if (nick.length > 0) continue;

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
