import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Kun admins.");
}

// Sync Discord role assignments for one league:
//   - Add role to everyone on the entry list (incl. waitlist) who is missing it.
//   - Remove role from everyone in the guild who has it but is not on the entry list.
export const syncDiscordRolesForLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leagueId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { addGuildRole, removeGuildRole, listGuildMemberIdsWithRole } = await import(
      "./discord.server"
    );

    const { data: league } = await supabaseAdmin
      .from("leagues")
      .select("id, name, discord_role_id")
      .eq("id", data.leagueId)
      .maybeSingle();
    const roleId = (league as { discord_role_id?: string | null } | null)?.discord_role_id ?? null;
    if (!roleId) {
      return { ok: false as const, reason: "no_role" as const };
    }

    // 1) Collect all entry user ids for this league (any division + waitlist)
    const { data: divs } = await supabaseAdmin
      .from("divisions")
      .select("id")
      .eq("league_id", data.leagueId);
    const divIds = (divs ?? []).map((d: { id: string }) => d.id);

    const orFilter =
      divIds.length > 0
        ? `league_id.eq.${data.leagueId},division_id.in.(${divIds.join(",")})`
        : `league_id.eq.${data.leagueId}`;

    const { data: entries } = await supabaseAdmin
      .from("entries")
      .select("user_id")
      .or(orFilter);
    const entryUserIds = Array.from(
      new Set((entries ?? []).map((e: { user_id: string }) => e.user_id).filter(Boolean)),
    );

    // 2) Map to Discord user ids
    let targetDiscordIds = new Set<string>();
    if (entryUserIds.length > 0) {
      const { data: privs } = await supabaseAdmin
        .from("profiles_private")
        .select("user_id, discord_user_id")
        .in("user_id", entryUserIds)
        .not("discord_user_id", "is", null);
      targetDiscordIds = new Set(
        (privs ?? [])
          .map((p: { discord_user_id: string | null }) => p.discord_user_id)
          .filter((x): x is string => !!x),
      );
    }

    // 3) Who currently has the role on Discord?
    const currentDiscordIds = new Set(await listGuildMemberIdsWithRole(roleId));

    // 4) Diff
    const toAdd: string[] = [];
    for (const id of targetDiscordIds) {
      if (!currentDiscordIds.has(id)) toAdd.push(id);
    }
    const toRemove: string[] = [];
    for (const id of currentDiscordIds) {
      if (!targetDiscordIds.has(id)) toRemove.push(id);
    }

    let added = 0;
    let removed = 0;
    const errors: string[] = [];

    for (const id of toAdd) {
      const r = await addGuildRole(id, roleId);
      if (r.ok) added++;
      else errors.push(`add ${id}: ${r.status} ${r.message ?? ""}`);
    }
    for (const id of toRemove) {
      const r = await removeGuildRole(id, roleId);
      if (r.ok) removed++;
      else errors.push(`remove ${id}: ${r.status} ${r.message ?? ""}`);
    }

    return {
      ok: true as const,
      leagueName: (league as { name?: string } | null)?.name ?? "",
      targets: targetDiscordIds.size,
      hadRole: currentDiscordIds.size,
      added,
      removed,
      errors: errors.slice(0, 10),
    };
  });

// Admin: delete a single entry and also remove the Discord role for that league
// (only if the user has no other entries left in that league).
export const adminDeleteEntryWithRoleCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: entry, error: eErr } = await supabaseAdmin
      .from("entries")
      .select("id, user_id, league_id, division_id")
      .eq("id", data.entryId)
      .maybeSingle();
    if (eErr) throw new Error(eErr.message);
    if (!entry) throw new Error("Entry findes ikke.");

    // Resolve the league id (entry may be on a division row)
    let leagueId: string | null = (entry as { league_id: string | null }).league_id;
    if (!leagueId && entry.division_id) {
      const { data: div } = await supabaseAdmin
        .from("divisions")
        .select("league_id")
        .eq("id", entry.division_id)
        .maybeSingle();
      leagueId = (div as { league_id?: string } | null)?.league_id ?? null;
    }

    // Delete the entry
    const { error: dErr } = await supabaseAdmin.from("entries").delete().eq("id", data.entryId);
    if (dErr) throw new Error(dErr.message);

    if (!leagueId) return { ok: true as const, roleRemoved: false };

    // Does the user still have any entries in this league? If yes, keep the role.
    const { data: divs } = await supabaseAdmin
      .from("divisions")
      .select("id")
      .eq("league_id", leagueId);
    const divIds = (divs ?? []).map((d: { id: string }) => d.id);
    const orFilter =
      divIds.length > 0
        ? `league_id.eq.${leagueId},division_id.in.(${divIds.join(",")})`
        : `league_id.eq.${leagueId}`;
    const { data: stillThere } = await supabaseAdmin
      .from("entries")
      .select("id")
      .eq("user_id", entry.user_id)
      .or(orFilter)
      .limit(1);
    if ((stillThere ?? []).length > 0) {
      return { ok: true as const, roleRemoved: false };
    }

    const { data: league } = await supabaseAdmin
      .from("leagues")
      .select("discord_role_id")
      .eq("id", leagueId)
      .maybeSingle();
    const roleId = (league as { discord_role_id?: string | null } | null)?.discord_role_id ?? null;
    if (!roleId) return { ok: true as const, roleRemoved: false };

    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", entry.user_id)
      .maybeSingle();
    const discordUserId =
      (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;
    if (!discordUserId) return { ok: true as const, roleRemoved: false };

    const { removeGuildRole } = await import("./discord.server");
    const r = await removeGuildRole(discordUserId, roleId);
    return { ok: true as const, roleRemoved: r.ok };
  });
