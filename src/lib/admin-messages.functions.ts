import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Standard template KEYS used by the admin → user flows. Template content
// (title + body) is loaded from the `message_templates` table so admins can
// edit them via the Besked Hub.
export const ADMIN_MESSAGE_TEMPLATE_KEYS = {
  wrong_name_in_guild: "wrong_name_in_guild",
  wrong_name_not_in_guild: "wrong_name_not_in_guild",
  profile_approved: "profile_approved",
} as const;

export const ADMIN_MESSAGE_LINKS: Record<string, string> = {
  wrong_name_in_guild: "/profil",
  wrong_name_not_in_guild: "/profil",
  profile_approved: "/ligaer",
};

const schema = z.object({
  targetUserId: z.string().uuid(),
  template: z.enum(["wrong_name", "profile_approved"]),
});

export const sendAdminTemplateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getTemplateByKey } = await import("./message-templates.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins kan sende beskeder til brugere.");

    let templateKey: string;
    let title: string;
    let body: string;
    let link: string;
    let attachWelcomeButton = false;

    if (data.template === "wrong_name") {
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

      templateKey = inGuild ? "wrong_name_in_guild" : "wrong_name_not_in_guild";
      const tpl = await getTemplateByKey(templateKey);
      title = tpl?.title ?? "Opdater dit navn for at blive godkendt";
      body = tpl?.body ?? "";
      const inviteUrl = process.env.DISCORD_INVITE_URL ?? "";
      body = body.replace(/\{discord_invite\}/g, inviteUrl || "(Discord-invitations-link mangler)");
      link = ADMIN_MESSAGE_LINKS[templateKey];
      // Attach the same "Skriv dit navn" button as #velkomst — only if linked to Discord
      attachWelcomeButton = !!discordUserId;
    } else {
      templateKey = "profile_approved";
      const tpl = await getTemplateByKey(templateKey);
      title = tpl?.title ?? "Din profil er godkendt";
      body = tpl?.body ?? "";
      link = ADMIN_MESSAGE_LINKS[templateKey];
    }

    // 1) Website notification
    const { error: notifErr } = await supabaseAdmin.from("notifications").insert({
      user_id: data.targetUserId,
      title,
      body,
      link,
    });
    if (notifErr) throw new Error(notifErr.message);
    try {
      const { sendPushToUser } = await import("./push.server");
      void sendPushToUser(data.targetUserId, { title, body: body.slice(0, 140), url: link }).catch(() => {});
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
      const content = `**${title}**\n\n${body}\n\nhttps://lmudanmark.dk${link}`;
      const components = attachWelcomeButton
        ? [
            {
              type: 1 as const,
              components: [
                {
                  type: 2 as const,
                  style: 1 as const,
                  label: "Skriv dit navn",
                  custom_id: "welcome_name",
                  emoji: { name: "✏️" },
                },
              ],
            },
          ]
        : undefined;
      const res = await sendDiscordDM(discordUserId, content, components as never);
      discordResult = res.ok
        ? { ok: true, status: res.status }
        : { ok: false, reason: "api_error", status: res.status };
      if (!res.ok) console.error("Admin DM failed", res);
    }

    // 3) Log
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

    const latest = new Map<string, string>();
    for (const r of (rows ?? []) as AdminMessageStatus[]) {
      if (!latest.has(r.user_id)) latest.set(r.user_id, r.sent_at);
    }
    return Array.from(latest, ([user_id, sent_at]) => ({ user_id, sent_at }));
  });
