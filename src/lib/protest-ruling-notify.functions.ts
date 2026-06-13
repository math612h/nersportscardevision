import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ protestId: z.string().uuid() });

const PROTEST_CHANNEL_ID = "1515455877174268095";

const OUTCOME_LABELS: Record<string, string> = {
  no_penalty: "Ingen straf",
  warning: "Advarsel",
  time_penalty: "Tidsstraf",
  point_penalty: "Pointstraf",
  disqualified: "Diskvalifikation",
};

function describeOutcome(outcome: string | null, details: any): string {
  const base = OUTCOME_LABELS[outcome ?? ""] ?? outcome ?? "Ukendt";
  if (outcome === "time_penalty" && details?.seconds) return `${base} (${details.seconds}s)`;
  if (outcome === "point_penalty" && details?.points) return `${base} (${details.points} point)`;
  return base;
}

export const notifyProtestRuling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Caller must be admin
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins kan sende afgørelser.");

    const { data: protest, error: pErr } = await supabaseAdmin
      .from("protests")
      .select("id, submitted_by, verdict_outcome, verdict_reason, verdict_details, divisions(name, leagues(name))")
      .eq("id", data.protestId)
      .maybeSingle();
    if (pErr || !protest) throw new Error(pErr?.message ?? "Protest ikke fundet");

    const { data: involved } = await supabaseAdmin
      .from("protest_involved")
      .select("user_id, driver_name")
      .eq("protest_id", data.protestId);

    const ligaNavn = (protest as any).divisions?.leagues?.name ?? "ligaen";
    const afdNavn = (protest as any).divisions?.name ?? "";
    const details = (protest as any).verdict_details ?? {};
    const outcomeText = describeOutcome((protest as any).verdict_outcome, details);
    const reason = (protest as any).verdict_reason ?? "";
    const penalizedIds: string[] = Array.isArray(details.penalized_user_ids) ? details.penalized_user_ids : [];

    // Resolve submitter name
    const { data: submitterProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", (protest as any).submitted_by)
      .maybeSingle();
    const submitterName = (submitterProfile as any)?.display_name ?? "Klager";

    const involvedList = (involved ?? []) as { user_id: string; driver_name: string }[];
    const allParties = new Map<string, string>();
    if ((protest as any).submitted_by) allParties.set((protest as any).submitted_by, submitterName);
    for (const r of involvedList) if (r.user_id) allParties.set(r.user_id, r.driver_name);

    const involvedNames = [submitterName, ...involvedList.map((r) => r.driver_name)].join(", ");
    const penalizedNames = penalizedIds
      .map((uid) => allParties.get(uid))
      .filter((n): n is string => Boolean(n));
    const penalizedText = penalizedNames.length > 0 ? penalizedNames.join(", ") : "Ingen";

    const title = "Afgørelse i incident-rapport";
    const link = "/mine-protests";
    const body =
      `Der er afgivet en afgørelse i en incident-rapport (${ligaNavn}${afdNavn ? " · " + afdNavn : ""}).\n\n` +
      `**Involverede:** ${involvedNames}\n` +
      `**Modtager straf:** ${penalizedText}\n` +
      `**Afgørelse:** ${outcomeText}\n\n` +
      `**Begrundelse:**\n${reason}`;

    // 1) Website notifications to all parties
    const recipientIds = Array.from(allParties.keys());
    if (recipientIds.length > 0) {
      const rows = recipientIds.map((uid) => ({
        user_id: uid,
        title,
        body,
        link,
      }));
      const { error: nErr } = await supabaseAdmin.from("notifications").insert(rows);
      if (nErr) console.error("notify ruling insert failed", nErr);
    }

    // 2) Discord DMs to all parties (best-effort)
    const { sendDiscordDM, sendDiscordChannelMessage } = await import("./discord.server");
    const dmContent = `**${title}** — ${ligaNavn}${afdNavn ? " · " + afdNavn : ""}\n\n${body}\n\nhttps://lmudanmark.dk${link}`;
    if (recipientIds.length > 0) {
      const { data: privs } = await supabaseAdmin
        .from("profiles_private")
        .select("user_id, discord_user_id")
        .in("user_id", recipientIds);
      await Promise.all(
        (privs ?? []).map(async (p: any) => {
          if (!p.discord_user_id) return;
          const res = await sendDiscordDM(p.discord_user_id, dmContent);
          if (!res.ok) console.error("Ruling DM failed", p.user_id, res);
        }),
      );
    }

    // 3) Post to protest channel
    const channelContent =
      `**${title}** — ${ligaNavn}${afdNavn ? " · " + afdNavn : ""}\n\n` +
      `**Involverede:** ${involvedNames}\n` +
      `**Modtager straf:** ${penalizedText}\n` +
      `**Afgørelse:** ${outcomeText}\n\n` +
      `**Begrundelse:**\n${reason}`;
    const chRes = await sendDiscordChannelMessage(PROTEST_CHANNEL_ID, channelContent);
    if (!chRes.ok) console.error("Ruling channel post failed", chRes);

    return { ok: true };
  });
