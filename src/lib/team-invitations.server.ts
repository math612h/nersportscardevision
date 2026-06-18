// Server-only helpers for responding to team invitations.
// Used by both the web server function and the Discord interactions endpoint.

export async function respondToTeamInvitationCore(opts: {
  invitationId: string;
  action: "accept" | "reject";
  actingUserId: string;
}): Promise<{ status: "ok" | "already" | "forbidden" | "missing"; teamName: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: inv } = await (supabaseAdmin as any)
    .from("team_invitations")
    .select("id, team_id, user_id, status, discord_channel_id, discord_message_id, teams:team_id(name)")
    .eq("id", opts.invitationId)
    .maybeSingle();
  if (!inv) return { status: "missing", teamName: "" };
  const teamName = (inv as any).teams?.name ?? "Team";
  if ((inv as any).user_id !== opts.actingUserId) return { status: "forbidden", teamName };
  if ((inv as any).status !== "pending") return { status: "already", teamName };

  const newStatus = opts.action === "accept" ? "accepted" : "rejected";
  const { error: updErr } = await (supabaseAdmin as any)
    .from("team_invitations")
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq("id", opts.invitationId)
    .eq("status", "pending");
  if (updErr) throw new Error(updErr.message);

  if (opts.action === "accept") {
    const { error: insErr } = await (supabaseAdmin as any)
      .from("team_members")
      .insert({ team_id: (inv as any).team_id, user_id: opts.actingUserId, role: "member" });
    if (insErr && (insErr as any).code !== "23505") throw new Error(insErr.message);
  }

  if ((inv as any).discord_channel_id && (inv as any).discord_message_id) {
    try {
      const { editDiscordMessage } = await import("./discord.server");
      const stamp = opts.action === "accept"
        ? "✅ Du har accepteret invitationen."
        : "❌ Du har afvist invitationen.";
      await editDiscordMessage(
        (inv as any).discord_channel_id,
        (inv as any).discord_message_id,
        `🏁 **Invitation til "${teamName}"**\n\n${stamp}`,
        [],
      );
    } catch (_) {}
  }

  return { status: "ok", teamName };
}
