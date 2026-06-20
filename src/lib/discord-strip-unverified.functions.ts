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



// Cron-variant: fjern "Medlem"-rollen fra ALLE nye joinere, uanset om de er
// approved på hjemmesiden. Hver Discord join behandles kun én gang, så rollen
// ikke fjernes igen efter #velkomst-modalen har givet den tilbage.
export async function stripNewJoinersImpl(): Promise<{
  scanned: number;
  stripped: number;
  errors: string[];
}> {
  const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID;
  if (!memberRoleId) throw new Error("DISCORD_MEMBER_ROLE_ID mangler.");

  const { listGuildMembersWithRole, removeGuildRole } = await import("./discord.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const allMembers = await listGuildMembersWithRole(memberRoleId);
  const cutoff = Date.now() - 30 * 60 * 1000;
  const newMembers = allMembers.filter((m) => {
    if (!m.joined_at) return false;
    const t = Date.parse(m.joined_at);
    return Number.isFinite(t) && t >= cutoff;
  });

  if (newMembers.length === 0) {
    return { scanned: 0, stripped: 0, errors: [] };
  }

  const { data: processedRows, error: processedError } = await (supabaseAdmin as any)
    .from("discord_member_role_strips")
    .select("discord_user_id, joined_at")
    .in("discord_user_id", newMembers.map((m) => m.id));
  if (processedError) throw new Error(`Kunne ikke hente Discord strip-log: ${processedError.message}`);

  const processed = new Set(
    ((processedRows ?? []) as Array<{ discord_user_id: string; joined_at: string }>).map(
      (r) => `${r.discord_user_id}:${new Date(r.joined_at).toISOString()}`,
    ),
  );
  const pendingMembers = newMembers.filter((m) =>
    m.joined_at ? !processed.has(`${m.id}:${new Date(m.joined_at).toISOString()}`) : false,
  );

  let stripped = 0;
  const errors: string[] = [];
  for (const m of pendingMembers) {
    try {
      const res = await removeGuildRole(m.id, memberRoleId);
      if (res.ok) stripped++;
      else errors.push(`${m.id}: ${res.status} ${res.message ?? ""}`);
      await (supabaseAdmin as any).from("discord_member_role_strips").upsert({
        discord_user_id: m.id,
        joined_at: new Date(m.joined_at!).toISOString(),
        removed_role: res.ok,
        processed_at: new Date().toISOString(),
        error: res.ok ? null : `${res.status} ${res.message ?? ""}`,
      });
    } catch (e) {
      errors.push(`${m.id}: ${(e as Error).message}`);
      await (supabaseAdmin as any).from("discord_member_role_strips").upsert({
        discord_user_id: m.id,
        joined_at: new Date(m.joined_at!).toISOString(),
        removed_role: false,
        processed_at: new Date().toISOString(),
        error: (e as Error).message,
      });
    }
  }
  return { scanned: pendingMembers.length, stripped, errors: errors.slice(0, 20) };
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
