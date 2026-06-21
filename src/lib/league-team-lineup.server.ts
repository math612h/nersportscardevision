// Server-only core for team-lineup invitation responses (shared between web RPC and Discord interactions).

export async function respondLeagueLineupCore(opts: {
  lineupId: string;
  action: "accept" | "decline";
  actingUserId: string;
}): Promise<{
  status: "ok" | "already" | "forbidden" | "missing";
  teamName: string;
  leagueName: string;
  allAccepted: boolean;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await (supabaseAdmin as any)
    .from("league_team_lineup")
    .select(
      "id, user_id, status, discord_channel_id, discord_message_id, league_team_entry_id, league_team_entries:league_team_entry_id(id, league_id, team_id, status, teams:team_id(name), leagues:league_id(name))",
    )
    .eq("id", opts.lineupId)
    .maybeSingle();

  if (!row) return { status: "missing", teamName: "", leagueName: "", allAccepted: false };
  const entry = (row as any).league_team_entries;
  const teamName: string = entry?.teams?.name ?? "Team";
  const leagueName: string = entry?.leagues?.name ?? "ligaen";

  if ((row as any).user_id !== opts.actingUserId) {
    return { status: "forbidden", teamName, leagueName, allAccepted: false };
  }
  if ((row as any).status !== "invited") {
    return { status: "already", teamName, leagueName, allAccepted: false };
  }

  const newStatus = opts.action === "accept" ? "accepted" : "declined";
  const { error: updErr } = await (supabaseAdmin as any)
    .from("league_team_lineup")
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq("id", opts.lineupId)
    .eq("status", "invited");
  if (updErr) throw new Error(updErr.message);

  let allAccepted = false;
  if (opts.action === "accept" && entry?.id) {
    const { data: siblings } = await (supabaseAdmin as any)
      .from("league_team_lineup")
      .select("status")
      .eq("league_team_entry_id", entry.id);
    const rows = (siblings ?? []) as Array<{ status: string }>;
    allAccepted = rows.length >= 2 && rows.every((r) => r.status === "accepted");
    if (allAccepted && entry.status !== "confirmed") {
      await (supabaseAdmin as any)
        .from("league_team_entries")
        .update({ status: "confirmed" })
        .eq("id", entry.id);
    }
  }

  if ((row as any).discord_channel_id && (row as any).discord_message_id) {
    try {
      const { editDiscordMessage } = await import("./discord.server");
      const stamp =
        opts.action === "accept"
          ? "✅ Du har accepteret pladsen på lineup."
          : "❌ Du har afvist pladsen på lineup.";
      await editDiscordMessage(
        (row as any).discord_channel_id,
        (row as any).discord_message_id,
        `🏁 **Lineup-invitation — "${teamName}" i ${leagueName}**\n\n${stamp}`,
        [],
      );
    } catch (_) {}
  }

  return { status: "ok", teamName, leagueName, allAccepted };
}
