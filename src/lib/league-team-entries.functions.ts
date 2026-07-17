import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  leagueId: z.string().uuid(),
  teamId: z.string().uuid(),
  carClass: z.string().min(1, "Vælg en bilklasse"),
  userIds: z.array(z.string().uuid()).min(2, "Et team-lineup skal indeholde mindst 2 kørere"),
});

export const submitTeamForLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => submitSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify caller is team owner (or admin)
    const { data: team } = await (supabaseAdmin as any)
      .from("teams")
      .select("id, name, owner_id")
      .eq("id", data.teamId)
      .maybeSingle();
    if (!team) throw new Error("Team findes ikke");

    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if ((team as any).owner_id !== context.userId && !isAdmin) {
      throw new Error("Kun teamejeren kan tilmelde teamet til en liga");
    }

    // Verify league exists and has the requested car_class
    const { data: league } = await (supabaseAdmin as any)
      .from("leagues")
      .select("id, name, class_configs")
      .eq("id", data.leagueId)
      .maybeSingle();
    if (!league) throw new Error("Ligaen findes ikke");
    const classes = new Set(
      (Array.isArray((league as any).class_configs) ? (league as any).class_configs : [])
        .map((c: any) => c?.car_class)
        .filter(Boolean),
    );
    if (!classes.has(data.carClass)) {
      throw new Error("Den valgte bilklasse findes ikke i ligaen");
    }

    // Verify all selected users are members of the team AND assigned to this car_class
    const { data: members } = await (supabaseAdmin as any)
      .from("team_members")
      .select("user_id, car_class")
      .eq("team_id", data.teamId);
    const memberMap = new Map<string, string | null>(
      ((members ?? []) as any[]).map((m) => [m.user_id, m.car_class ?? null]),
    );
    for (const uid of data.userIds) {
      if (!memberMap.has(uid)) throw new Error("En valgt kører er ikke medlem af teamet");
      const cc = memberMap.get(uid);
      if (cc !== data.carClass) {
        throw new Error(
          `En valgt kører er ikke tilknyttet ${data.carClass} i teamet. Team-ejeren skal først tildele kørerens klasse på team-siden.`,
        );
      }
    }

    // Verify every selected user is signed up in this league + class
    const { data: entries } = await (supabaseAdmin as any)
      .from("entries")
      .select("user_id")
      .eq("league_id", data.leagueId)
      .eq("car_class", data.carClass)
      .in("user_id", data.userIds);
    const enrolled = new Set(((entries ?? []) as any[]).map((e) => e.user_id));
    for (const uid of data.userIds) {
      if (!enrolled.has(uid)) {
        throw new Error(
          `Alle valgte kørere skal være tilmeldt ${data.carClass} i ligaen før de kan sættes på lineupet`,
        );
      }
    }

    // Block users locked to another team in another active league
    for (const uid of data.userIds) {
      const { data: locked } = await (supabaseAdmin as any).rpc("user_locked_team", {
        _user_id: uid,
      });
      if (locked && locked !== data.teamId) {
        throw new Error("En valgt kører er låst til et andet team i en aktiv liga");
      }
    }

    // Insert / fetch the entry (unique on league_id+team_id+car_class)
    const { data: existing } = await (supabaseAdmin as any)
      .from("league_team_entries")
      .select("id, status")
      .eq("league_id", data.leagueId)
      .eq("team_id", data.teamId)
      .eq("car_class", data.carClass)
      .maybeSingle();

    let entryId: string;
    if (existing) {
      entryId = (existing as any).id;
      if ((existing as any).status === "withdrawn") {
        await (supabaseAdmin as any)
          .from("league_team_entries")
          .update({ status: "pending", submitted_by: context.userId })
          .eq("id", entryId);
      }
    } else {
      const { data: ins, error: insErr } = await (supabaseAdmin as any)
        .from("league_team_entries")
        .insert({
          league_id: data.leagueId,
          team_id: data.teamId,
          car_class: data.carClass,
          submitted_by: context.userId,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      entryId = (ins as any).id;
    }

    // Reset lineup: remove existing rows that are not in the new selection
    await (supabaseAdmin as any)
      .from("league_team_lineup")
      .delete()
      .eq("league_team_entry_id", entryId)
      .not("user_id", "in", `(${data.userIds.map((u) => `"${u}"`).join(",")})`);

    // Upsert lineup rows — team owner is auto-accepted so they don't have to re-confirm.
    const ownerId = (team as any).owner_id as string;
    const lineupRows = data.userIds.map((uid) => ({
      league_team_entry_id: entryId,
      league_id: data.leagueId,
      user_id: uid,
      status: (uid === ownerId ? "accepted" : "invited") as "accepted" | "invited",
      responded_at: uid === ownerId ? new Date().toISOString() : null,
    }));
    const { data: upserted, error: upErr } = await (supabaseAdmin as any)
      .from("league_team_lineup")
      .upsert(lineupRows, { onConflict: "league_team_entry_id,user_id", ignoreDuplicates: false })
      .select("id, user_id, status, discord_message_id");
    if (upErr) throw new Error(upErr.message);

    // If all lineup rows are now accepted (e.g. solo owner + auto-accept covers everyone),
    // promote the entry to confirmed immediately.
    try {
      const { data: allRows } = await (supabaseAdmin as any)
        .from("league_team_lineup")
        .select("status")
        .eq("league_team_entry_id", entryId);
      const rows = (allRows ?? []) as Array<{ status: string }>;
      if (rows.length >= 2 && rows.every((r) => r.status === "accepted")) {
        await (supabaseAdmin as any)
          .from("league_team_entries")
          .update({ status: "confirmed" })
          .eq("id", entryId);
      }
    } catch (_) {}

    // Send Discord DM to each invited user (best-effort)
    try {
      const { sendDiscordDM } = await import("./discord.server");
      const ids = ((upserted ?? []) as any[]).filter((r) => r.status === "invited");
      for (const lineup of ids) {
        const { data: priv } = await (supabaseAdmin as any)
          .from("profiles_private")
          .select("discord_user_id")
          .eq("user_id", lineup.user_id)
          .maybeSingle();
        const discordUserId = (priv as any)?.discord_user_id as string | null | undefined;
        if (!discordUserId) continue;

        const content = [
          `🏁 **Lineup-invitation — "${(team as any).name}" i ${(league as any).name} · ${data.carClass}**`,
          "",
          `Du er valgt til teamets lineup i ${data.carClass}.`,
          `Tryk Accepter for at bekræfte, eller Afvis for at takke nej.`,
          "",
          `Eller svar på hjemmesiden: https://lmudanmark.dk/teams/${data.teamId}`,
        ].join("\n");

        const components = [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: "Accepter", custom_id: `team_lineup_accept:${lineup.id}` },
              { type: 2, style: 4, label: "Afvis", custom_id: `team_lineup_decline:${lineup.id}` },
            ],
          },
        ];

        const dm = await sendDiscordDM(discordUserId, content, components).catch(() => null);
        if (dm?.ok && dm.channelId && dm.messageId) {
          await (supabaseAdmin as any)
            .from("league_team_lineup")
            .update({ discord_channel_id: dm.channelId, discord_message_id: dm.messageId })
            .eq("id", lineup.id);
        }
      }
    } catch (_) {}

    // In-app notification
    try {
      const rows = data.userIds.map((uid) => ({
        user_id: uid,
        title: `Du er valgt til "${(team as any).name}" lineup i ${(league as any).name} (${data.carClass})`,
        body: "Åbn team-siden for at acceptere eller afvise pladsen.",
        link: `/teams/${data.teamId}`,
      }));
      await (supabaseAdmin as any).from("notifications").insert(rows);
    } catch (_) {}

    return { ok: true, entryId };
  });

const respondSchema = z.object({
  lineupId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

export const respondLeagueLineup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => respondSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { respondLeagueLineupCore } = await import("./league-team-lineup.server");
    const res = await respondLeagueLineupCore({
      lineupId: data.lineupId,
      action: data.action,
      actingUserId: context.userId,
    });
    if (res.status === "missing") throw new Error("Lineup-invitationen findes ikke");
    if (res.status === "forbidden") throw new Error("Du har ikke adgang til denne invitation");
    if (res.status === "already") throw new Error("Invitationen er allerede besvaret");
    return { ok: true, teamName: res.teamName, allAccepted: res.allAccepted };
  });

const withdrawSchema = z.object({ entryId: z.string().uuid() });

export const withdrawTeamFromLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => withdrawSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entry } = await (supabaseAdmin as any)
      .from("league_team_entries")
      .select("id, team_id, league_id, teams:team_id(owner_id)")
      .eq("id", data.entryId)
      .maybeSingle();
    if (!entry) throw new Error("Tilmelding findes ikke");

    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if ((entry as any).teams?.owner_id !== context.userId && !isAdmin) {
      throw new Error("Kun teamejeren kan trække tilmeldingen tilbage");
    }

    const { data: active } = await (supabaseAdmin as any).rpc("league_is_active", {
      _league_id: (entry as any).league_id,
    });
    if (active && !isAdmin) {
      throw new Error("Ligaen er aktiv — tilmeldingen kan ikke trækkes tilbage");
    }

    await (supabaseAdmin as any)
      .from("league_team_entries")
      .update({ status: "withdrawn" })
      .eq("id", data.entryId);

    // Cancel pending invites
    await (supabaseAdmin as any)
      .from("league_team_lineup")
      .delete()
      .eq("league_team_entry_id", data.entryId)
      .eq("status", "invited");

    return { ok: true };
  });
