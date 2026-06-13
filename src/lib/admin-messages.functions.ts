import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Standard templates for admin → user messages. Each template renders on the
// website (via notifications) and is also DMed on Discord when linked.
export const ADMIN_MESSAGE_TEMPLATES = {
  wrong_name: {
    title: "Opdater dit navn for at blive godkendt",
    body:
      "Hej! For at blive godkendt som kører på LMU Danmark skal du registrere dig med dit rigtige for- og efternavn (uden forkortelser, kælenavne eller initialer). " +
      "Gå til din profil og opdater dit visningsnavn — så godkender vi dig hurtigst muligt.",
    link: "/profil",
  },
} as const;

export type AdminMessageTemplate = keyof typeof ADMIN_MESSAGE_TEMPLATES;

const schema = z.object({
  targetUserId: z.string().uuid(),
  template: z.enum(["wrong_name"]),
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

    // 1) Website notification
    const { error: notifErr } = await supabaseAdmin.from("notifications").insert({
      user_id: data.targetUserId,
      title: tpl.title,
      body: tpl.body,
      link: tpl.link,
    });
    if (notifErr) throw new Error(notifErr.message);

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
      const content = `**${tpl.title}**\n\n${tpl.body}\n\nhttps://lmudanmark.dk${tpl.link}`;
      const res = await sendDiscordDM(discordUserId, content);
      discordResult = res.ok
        ? { ok: true, status: res.status }
        : { ok: false, reason: "api_error", status: res.status };
      if (!res.ok) console.error("Admin DM failed", res);
    }

    return { ok: true, discord: discordResult };
  });
