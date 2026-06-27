// Server-only helpers for syncing a team's Discord role / category / channels.
// Safe to import from other *.server.ts files. Do not import from client code.

type Team = {
  id: string;
  name: string;
  logo_url: string | null;
  discord_role_id: string | null;
  discord_category_id: string | null;
  discord_text_channel_id: string | null;
  discord_voice_channel_id: string | null;
  discord_welcome_sent_at: string | null;
};

export type SyncTeamResult = {
  ok: boolean;
  created?: { role?: boolean; category?: boolean; text?: boolean; voice?: boolean };
  rolesAdded?: number;
  rolesRemoved?: number;
  errors?: string[];
  reason?: string;
};

export async function syncTeamDiscordResourcesCore(teamId: string): Promise<SyncTeamResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    createGuildRole,
    editGuildRole,
    createGuildChannel,
    editGuildChannel,
    teamTextChannelOverwrites,
    teamVoiceChannelOverwrites,
    getEveryoneRoleId,
    getBotUserId,
    addGuildRole,
    removeGuildRole,
    listGuildMemberIdsWithRole,
    sendDiscordChannelRichMessage,
  } = await import("./discord.server");

  const { data: teamRow } = await supabaseAdmin
    .from("teams")
    .select(
      "id, name, logo_url, discord_role_id, discord_category_id, discord_text_channel_id, discord_voice_channel_id, discord_welcome_sent_at",
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
  const botUserId = await getBotUserId().catch(() => null);
  if (botUserId && roleId) {
    // Existing team text channels are private to the team role. Give the bot the
    // team role too, otherwise Discord returns "Missing Access" before we can
    // patch the channel overwrites or send the welcome message.
    const botRole = await addGuildRole(botUserId, roleId);
    if (!botRole.ok && botRole.status !== 204) {
      errors.push(`bot role: ${botRole.status} ${botRole.message ?? ""}`);
    }
  }

  if (!textId && categoryId) {
    const t = await createGuildChannel({
      name: `${team.name}-chat`,
      type: 0,
      parent_id: categoryId,
      permission_overwrites: teamTextChannelOverwrites(everyone, roleId!, botUserId),
    });
    if (t.ok && t.id) {
      textId = t.id;
      created.text = true;
    } else {
      errors.push(`text: ${t.status} ${t.message ?? ""}`);
    }
  } else if (textId && roleId) {
    const t = await editGuildChannel(textId, {
      name: `${team.name}-chat`,
      parent_id: categoryId,
      permission_overwrites: teamTextChannelOverwrites(everyone, roleId, botUserId),
    });
    if (!t.ok && t.status !== 404) errors.push(`text update: ${t.status} ${t.message ?? ""}`);
  }

  if (!voiceId && categoryId) {
    const v = await createGuildChannel({
      name: `${team.name} Voice`,
      type: 2,
      parent_id: categoryId,
      permission_overwrites: teamVoiceChannelOverwrites(everyone, roleId!, botUserId),
    });
    if (v.ok && v.id) {
      voiceId = v.id;
      created.voice = true;
    } else {
      const msg = `voice[${team.name}]: ${v.status} ${v.message ?? ""}`;
      console.error("[team-discord]", msg);
      errors.push(msg);
    }
  } else if (voiceId && roleId) {
    const v = await editGuildChannel(voiceId, {
      name: `${team.name} Voice`,
      parent_id: categoryId,
      permission_overwrites: teamVoiceChannelOverwrites(everyone, roleId, botUserId),
    });
    if (!v.ok && v.status !== 404) errors.push(`voice update: ${v.status} ${v.message ?? ""}`);
  }

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
      if (id === botUserId) continue;
      if (!targetDiscordIds.has(id)) {
        const r = await removeGuildRole(id, roleId);
        if (r.ok) rolesRemoved++;
        else errors.push(`remove ${id}: ${r.status} ${r.message ?? ""}`);
      }
    }
  }

  // Send welcome message once per team (after text channel exists and members have been synced)
  if (textId && !team.discord_welcome_sent_at) {
    try {
      const { data: members2 } = await supabaseAdmin
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId);
      const memberIds2 = (members2 ?? []).map((m: { user_id: string }) => m.user_id);

      // Exclude site admins/moderators from the welcome ping even if they are team members.
      let nonAdminMemberIds = memberIds2;
      if (memberIds2.length > 0) {
        const { data: staffRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", memberIds2)
          .in("role", ["admin"]);
        const staffIds = new Set((staffRoles ?? []).map((r: { user_id: string }) => r.user_id));
        nonAdminMemberIds = memberIds2.filter((id) => !staffIds.has(id));
      }

      let mentionIds: string[] = [];
      if (nonAdminMemberIds.length > 0) {
        const { data: privs2 } = await supabaseAdmin
          .from("profiles_private")
          .select("discord_user_id")
          .in("user_id", nonAdminMemberIds)
          .not("discord_user_id", "is", null);
        mentionIds = (privs2 ?? [])
          .map((p: { discord_user_id: string | null }) => p.discord_user_id)
          .filter((x): x is string => !!x);
      }

      let logoUrl: string | null = null;
      if (team.logo_url) {
        const { data: signed } = await supabaseAdmin
          .storage.from("team-logos")
          .createSignedUrl(team.logo_url, 60 * 60 * 24 * 30);
        logoUrl = signed?.signedUrl ?? null;
      }

      // Only ping individual (non-admin) team members. Never fall back to the role mention,
      // since admins may carry the team role for moderation access.
      const pingLine = mentionIds.length > 0
        ? mentionIds.map((id) => `<@${id}>`).join(" ")
        : "";


      const embed: Record<string, unknown> = {
        title: `Velkommen til ${team.name}!`,
        description:
          "Velkommen til jeres helt egen, dedikeret team chat, med tilhørende talekanal.\n\nBrug kanalerne til at planlægge træning, dele opsætninger og koordinere løb. God fornøjelse! 🏁",
        color: 0xe10600,
        footer: { text: "LMU Danmark" },
      };
      // Do not attach the logo URL as an embed thumbnail unless the bot has the
      // Discord "Embed Links" permission. Signing with the team avatar in the
      // footer keeps the message stable even on servers where embeds with
      // external links are blocked for bots.

      const r = await sendDiscordChannelRichMessage(textId, {
        content: pingLine || undefined,
        embeds: [embed],
        userMentions: mentionIds,
      });
      if (r.ok) {
        await supabaseAdmin
          .from("teams")
          .update({ discord_welcome_sent_at: new Date().toISOString() })
          .eq("id", teamId);
      } else {
        const msg = `welcome[${team.name}]: ${r.status} ${r.message ?? ""}`;
        console.error("[team-discord]", msg);
        errors.push(msg);
      }
    } catch (e) {
      const msg = `welcome[${team.name}]: ${(e as Error).message}`;
      console.error("[team-discord]", msg);
      errors.push(msg);
    }
  }

  return { ok: true, created, rolesAdded, rolesRemoved, errors: errors.slice(0, 10) };
}

export async function deleteTeamDiscordResourcesCore(teamId: string): Promise<{ ok: true; removed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { deleteGuildChannel, deleteGuildRole } = await import("./discord.server");
  const { data: row } = await supabaseAdmin
    .from("teams")
    .select(
      "discord_role_id, discord_category_id, discord_text_channel_id, discord_voice_channel_id",
    )
    .eq("id", teamId)
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
    .eq("id", teamId);
  return { ok: true, removed };
}
