import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Strips the "Medlem" role from every guild member who has NOT completed the
// #velkomst flow. The welcome modal always sets a server nickname ("Fornavn
// Efternavn"), so a member with the Medlem role but no server nickname must
// have received it from another source (Discord onboarding, server template,
// external bot) and should be forced back through #velkomst.
export async function stripUnverifiedMembersImpl(): Promise<{
  scanned: number;
  stripped: number;
  errors: string[];
}> {
  const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID;
  if (!memberRoleId) throw new Error("DISCORD_MEMBER_ROLE_ID mangler.");

  const { listGuildMembersWithRole, removeGuildRole } = await import("./discord.server");
  const members = await listGuildMembersWithRole(memberRoleId);

  let stripped = 0;
  const errors: string[] = [];

  for (const m of members) {
    const nick = (m.nick ?? "").trim();
    if (nick.length > 0) continue; // har været igennem velkomst-modal
    try {
      const res = await removeGuildRole(m.id, memberRoleId);
      if (res.ok) stripped++;
      else errors.push(`${m.id}: ${res.status} ${res.message ?? ""}`);
    } catch (e) {
      errors.push(`${m.id}: ${(e as Error).message}`);
    }
  }

  return { scanned: members.length, stripped, errors: errors.slice(0, 20) };
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
