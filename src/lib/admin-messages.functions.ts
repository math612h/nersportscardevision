import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Standard templates for admin → user messages. Each template renders on the
// website (via notifications) and is also DMed on Discord when linked.
export const ADMIN_MESSAGE_TEMPLATES = {
  wrong_name: {
    title: "Opdater dit navn for at blive godkendt",
    // Used when the user is NOT in the Discord guild
    bodyNotInGuild:
      "Hej! For at blive godkendt som kører på LMU Danmark skal to ting være på plads:\n\n" +
      "1) Du skal være medlem af vores Discord-server. Det er en forudsætning for at blive godkendt, fordi vi koordinerer kørsel, briefings og protester via Discord. " +
      "Du kan tilmelde dig her: {discord_invite}\n\n" +
      "2) Du skal registrere dig med dit rigtige for- og efternavn (uden forkortelser, kælenavne eller initialer), og det samme navn skal stå som dit server-nickname på vores Discord-server (ikke din globale Discord-profil). " +
      "Vi bruger navnet til at koble din bruger på hjemmesiden sammen med din Discord-bruger.\n\n" +
      "Gå til din profil og opdater dit visningsnavn — og ret samtidig dit server-nickname på LMU Danmark Discord-serveren — så godkender vi dig hurtigst muligt.",
    // Used when the user IS already in the Discord guild
    bodyInGuild:
      "Hej! For at blive godkendt som kører på LMU Danmark skal du registrere dig med dit rigtige for- og efternavn (uden forkortelser, kælenavne eller initialer), og det samme navn skal stå som dit server-nickname på vores Discord-server (ikke din globale Discord-profil). " +
      "Vi bruger navnet til at koble din bruger på hjemmesiden sammen med din Discord-bruger.\n\n" +
      "Gå til din profil og opdater dit visningsnavn — og ret samtidig dit server-nickname på LMU Danmark Discord-serveren — så godkender vi dig hurtigst muligt.",
    link: "/profil",
  },
  profile_approved: {
    title: "Din profil er godkendt",
    body:
      "Hej! Din profil på LMU Danmark er nu godkendt. Du kan nu tilmelde dig ligaer og deltage i kampene. " +
      "Gå til liga-oversigten og find en liga der passer til dig.",
    link: "/ligaer",
  },
} as const;

export type AdminMessageTemplate = keyof typeof ADMIN_MESSAGE_TEMPLATES;

const schema = z.object({
  targetUserId: z.string().uuid(),
  template: z.enum(["wrong_name", "profile_approved"]),
});

export const sendAdminTemplateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only admins may send admin messages
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins kan sende beskeder til brugere.");

    const tpl = ADMIN_MESSAGE_TEMPLATES[data.template];
    let body: string;

    if (data.template === "wrong_name") {
      // Check whether target user is already in the Discord guild
      const { data: priv } = await supabaseAdmin
        .from("profiles_private")
        .select("discord_user_id")
        .eq("user_id", data.targetUserId)
        .maybeSingle();
      const discordUserId = (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;

      let inGuild = false;
      if (discordUserId) {
        const { isUserInGuild } = await import("./discord.server");
        const res = await isUserInGuild(discordUserId);
        inGuild = res.inGuild;
      }

      const wrongTpl = ADMIN_MESSAGE_TEMPLATES.wrong_name;
      if (inGuild) {
        body = wrongTpl.bodyInGuild;
      } else {
        const inviteUrl = process.env.DISCORD_INVITE_URL ?? "";
        body = wrongTpl.bodyNotInGuild.replace(/\{discord_invite\}/g, inviteUrl || "(Discord-invitations-link mangler — kontakt en admin)");
      }
    } else {
      body = ADMIN_MESSAGE_TEMPLATES.profile_approved.body;
    }

    // 1) Website notification
    const { error: notifErr } = await supabaseAdmin.from("notifications").insert({
      user_id: data.targetUserId,
      title: tpl.title,
      body,
      link: tpl.link,
    });
    if (notifErr) throw new Error(notifErr.message);
    try {
      const { sendPushToUser } = await import("./push.server");
      void sendPushToUser(data.targetUserId, { title: tpl.title, body: body.slice(0, 140), url: tpl.link }).catch(() => {});
    } catch (_) {}

    // 2) Discord DM (best-effort)
    let discordResult: { ok: boolean; reason?: string; status?: number } = { ok: false, reason: "not_linked" };
    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", data.targetUserId)
      .maybeSingle();
    const discordUserId = (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;
    if (discordUserId) {
      const { sendDiscordDM } = await import("./discord.server");
      const content = `**${tpl.title}**\n\n${body}\n\nhttps://lmudanmark.dk${tpl.link}`;
      const res = await sendDiscordDM(discordUserId, content);
      discordResult = res.ok
        ? { ok: true, status: res.status }
        : { ok: false, reason: "api_error", status: res.status };
      if (!res.ok) console.error("Admin DM failed", res);
    }

    // 3) Log that we sent this template (best-effort, ignore errors)
    await (supabaseAdmin as any).from("admin_message_log").insert({
      user_id: data.targetUserId,
      template: data.template,
      sent_by: context.userId,
    });

    return { ok: true, discord: discordResult };
  });

const statusSchema = z.object({
  userIds: z.array(z.string().uuid()).max(500),
  template: z.enum(["wrong_name", "profile_approved"]),
});

export type AdminMessageStatus = {
  user_id: string;
  sent_at: string;
};

export const getAdminMessageStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => statusSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminMessageStatus[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins.");
    if (data.userIds.length === 0) return [];

    const { data: rows, error } = await (supabaseAdmin as any)
      .from("admin_message_log")
      .select("user_id, sent_at")
      .eq("template", data.template)
      .in("user_id", data.userIds)
      .order("sent_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Reduce to latest per user
    const latest = new Map<string, string>();
    for (const r of (rows ?? []) as AdminMessageStatus[]) {
      if (!latest.has(r.user_id)) latest.set(r.user_id, r.sent_at);
    }
    return Array.from(latest, ([user_id, sent_at]) => ({ user_id, sent_at }));
  });
