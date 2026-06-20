import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Strips the "Medlem" role from every guild member who is NOT approved on
// the website. Approval = a profile row with approved=true linked to the
// Discord user id via profiles_private.discord_user_id.
export async function stripUnverifiedMembersImpl(): Promise<{
  scanned: number;
  stripped: number;
  errors: string[];
}> {
  const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID;
  if (!memberRoleId) throw new Error("DISCORD_MEMBER_ROLE_ID mangler.");

  const { listGuildMembersWithRole, removeGuildRole } = await import("./discord.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const members = await listGuildMembersWithRole(memberRoleId);

  // Build set of approved Discord user ids
  const { data: approvedRows, error } = await supabaseAdmin
    .from("profiles_private")
    .select("discord_user_id, profiles!inner(approved)")
    .not("discord_user_id", "is", null)
    .eq("profiles.approved", true);
  if (error) throw new Error(`Kunne ikke hente godkendte profiler: ${error.message}`);
  const approved = new Set(
    (approvedRows ?? [])
      .map((r: { discord_user_id: string | null }) => r.discord_user_id)
      .filter((v): v is string => !!v),
  );

  let stripped = 0;
  const errors: string[] = [];

  for (const m of members) {
    if (approved.has(m.id)) continue; // godkendt på hjemmesiden — behold rolle
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



// Cron-variant: fjern "Medlem"-rollen fra ALLE nye joinere (sidste 10 min),
// uanset om de er approved på hjemmesiden. De skal igennem #velkomst-modalen
// for at få rollen igen.
export async function stripNewJoinersImpl(): Promise<{
  scanned: number;
  stripped: number;
  errors: string[];
}> {
  const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID;
  if (!memberRoleId) throw new Error("DISCORD_MEMBER_ROLE_ID mangler.");

  const { listGuildMembersWithRole, removeGuildRole } = await import("./discord.server");
  const allMembers = await listGuildMembersWithRole(memberRoleId);
  const cutoff = Date.now() - 10 * 60 * 1000;
  const newMembers = allMembers.filter((m) => {
    if (!m.joined_at) return false;
    const t = Date.parse(m.joined_at);
    return Number.isFinite(t) && t >= cutoff;
  });

  let stripped = 0;
  const errors: string[] = [];
  for (const m of newMembers) {
    try {
      const res = await removeGuildRole(m.id, memberRoleId);
      if (res.ok) stripped++;
      else errors.push(`${m.id}: ${res.status} ${res.message ?? ""}`);
    } catch (e) {
      errors.push(`${m.id}: ${(e as Error).message}`);
    }
  }
  return { scanned: newMembers.length, stripped, errors: errors.slice(0, 20) };
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
