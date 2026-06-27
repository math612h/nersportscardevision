import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Team = {
  id: string;
  name: string;
  discord_role_id: string | null;
  discord_category_id: string | null;
  discord_text_channel_id: string | null;
  discord_voice_channel_id: string | null;
};

async function syncOneTeam(teamId: string): Promise<{
  ok: boolean;
  created?: { role?: boolean; category?: boolean; text?: boolean; voice?: boolean };
  rolesAdded?: number;
  rolesRemoved?: number;
  errors?: string[];
  reason?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    createGuildRole,
    editGuildRole,
    createGuildChannel,
    editGuildChannel,
    teamTextChannelOverwrites,
    teamVoiceChannelOverwrites,
    getEveryoneRoleId,
    addGuildRole,
    removeGuildRole,
    listGuildMemberIdsWithRole,
  } = await import("./discord.server");

  const { data: teamRow } = await supabaseAdmin
    .from("teams")
    .select(
      "id, name, discord_role_id, discord_category_id, discord_text_channel_id, discord_voice_channel_id",
    )
    .eq("id", teamId)
    .maybeSingle();
  const team = teamRow as Team | null;
  if (!team) return { ok: false, reason: "team_not_found" };

  const errors: string[] = [];
  const created = { role: false, category: false, text: false, voice: false };
  let roleId = team.discord_role_id;
  let categoryId = team.discord_category_id;
  let textId = team.discord_text_channel_id;
  let voiceId = team.discord_voice_channel_id;

  // 1) Role
  if (!roleId) {
    const r = await createGuildRole(team.name);
    if (r.ok && r.id) {
      roleId = r.id;
      created.role = true;
    } else {
      errors.push(`role: ${r.status} ${r.message ?? ""}`);
      return { ok: false, errors, reason: "role_create_failed" };
    }
  } else {
    const r = await editGuildRole(roleId, { name: team.name });
    if (!r.ok && r.status !== 404) errors.push(`role rename: ${r.status} ${r.message ?? ""}`);
  }

  // 2) Category
  if (!categoryId) {
    const c = await createGuildChannel({ name: team.name, type: 4 });
    if (c.ok && c.id) {
      categoryId = c.id;
      created.category = true;
    } else {
      errors.push(`category: ${c.status} ${c.message ?? ""}`);
    }
  } else {
    const c = await editGuildChannel(categoryId, { name: team.name });
    if (!c.ok && c.status !== 404) errors.push(`category rename: ${c.status} ${c.message ?? ""}`);
  }

  const everyone = getEveryoneRoleId();

  // 3) Text channel
  if (!textId && categoryId) {
    const t = await createGuildChannel({
      name: `${team.name}-chat`,
      type: 0,
      parent_id: categoryId,
      permission_overwrites: teamTextChannelOverwrites(everyone, roleId!),
    });
    if (t.ok && t.id) {
      textId = t.id;
      created.text = true;
    } else {
      errors.push(`text: ${t.status} ${t.message ?? ""}`);
    }
  }

  // 4) Voice channel
  if (!voiceId && categoryId) {
    const v = await createGuildChannel({
      name: `${team.name} Voice`,
      type: 2,
      parent_id: categoryId,
      permission_overwrites: teamVoiceChannelOverwrites(everyone, roleId!),
    });
    if (v.ok && v.id) {
      voiceId = v.id;
      created.voice = true;
    } else {
      errors.push(`voice: ${v.status} ${v.message ?? ""}`);
    }
  }

  // Persist any new IDs
  await supabaseAdmin
    .from("teams")
    .update({
      discord_role_id: roleId,
      discord_category_id: categoryId,
      discord_text_channel_id: textId,
      discord_voice_channel_id: voiceId,
      discord_synced_at: new Date().toISOString(),
    })
    .eq("id", teamId);

  // 5) Sync members <-> role
  let rolesAdded = 0;
  let rolesRemoved = 0;
  if (roleId) {
    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId);
    const memberUserIds = (members ?? []).map((m: { user_id: string }) => m.user_id);

    let targetDiscordIds = new Set<string>();
    if (memberUserIds.length > 0) {
      const { data: privs } = await supabaseAdmin
        .from("profiles_private")
        .select("discord_user_id")
        .in("user_id", memberUserIds)
        .not("discord_user_id", "is", null);
      targetDiscordIds = new Set(
        (privs ?? [])
          .map((p: { discord_user_id: string | null }) => p.discord_user_id)
          .filter((x): x is string => !!x),
      );
    }

    let currentDiscordIds = new Set<string>();
    try {
      currentDiscordIds = new Set(await listGuildMemberIdsWithRole(roleId));
    } catch (e) {
      errors.push(`list role members: ${(e as Error).message}`);
    }

    for (const id of targetDiscordIds) {
      if (!currentDiscordIds.has(id)) {
        const r = await addGuildRole(id, roleId);
        if (r.ok) rolesAdded++;
        else errors.push(`add ${id}: ${r.status} ${r.message ?? ""}`);
      }
    }
    for (const id of currentDiscordIds) {
      if (!targetDiscordIds.has(id)) {
        const r = await removeGuildRole(id, roleId);
        if (r.ok) rolesRemoved++;
        else errors.push(`remove ${id}: ${r.status} ${r.message ?? ""}`);
      }
    }
  }

  return { ok: true, created, rolesAdded, rolesRemoved, errors: errors.slice(0, 10) };
}

// Public: any authenticated user can trigger a sync for a team (idempotent).
// Useful right after team creation / member changes from client code.
export const syncTeamDiscordResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ teamId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      return await syncOneTeam(data.teamId);
    } catch (e) {
      return { ok: false, errors: [(e as Error).message], reason: "exception" };
    }
  });

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Kun admins.");
}

// Admin: backfill / re-sync every team.
export const syncAllTeamsDiscordResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: teams } = await supabaseAdmin.from("teams").select("id, name");
    const list = (teams ?? []) as { id: string; name: string }[];
    const results: Array<{ teamId: string; name: string; ok: boolean; errors?: string[] }> = [];
    for (const t of list) {
      const r = await syncOneTeam(t.id);
      results.push({ teamId: t.id, name: t.name, ok: r.ok, errors: r.errors });
    }
    return {
      ok: true,
      total: list.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      details: results.slice(0, 50),
    };
  });

// Admin: delete Discord resources for a team (used before/with team deletion).
export const deleteTeamDiscordResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ teamId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteGuildChannel, deleteGuildRole } = await import("./discord.server");
    const { data: row } = await supabaseAdmin
      .from("teams")
      .select(
        "discord_role_id, discord_category_id, discord_text_channel_id, discord_voice_channel_id",
      )
      .eq("id", data.teamId)
      .maybeSingle();
    const t = row as Team | null;
    if (!t) return { ok: true, removed: 0 };
    let removed = 0;
    for (const id of [t.discord_text_channel_id, t.discord_voice_channel_id, t.discord_category_id]) {
      if (id) {
        const r = await deleteGuildChannel(id);
        if (r.ok) removed++;
      }
    }
    if (t.discord_role_id) {
      const r = await deleteGuildRole(t.discord_role_id);
      if (r.ok) removed++;
    }
    await supabaseAdmin
      .from("teams")
      .update({
        discord_role_id: null,
        discord_category_id: null,
        discord_text_channel_id: null,
        discord_voice_channel_id: null,
        discord_synced_at: new Date().toISOString(),
      })
      .eq("id", data.teamId);
    return { ok: true, removed };
  });
