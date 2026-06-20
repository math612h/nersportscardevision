import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MessageTemplate = {
  id: string;
  key: string;
  title: string;
  body: string;
  default_channel_id: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Kun admins.");
}

export const listMessageTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MessageTemplate[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("message_templates")
      .select("*")
      .order("is_system", { ascending: false })
      .order("title", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MessageTemplate[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/i, "Kun bogstaver, tal og _"),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  default_channel_id: z.string().trim().max(40).nullable().optional(),
});

export const upsertMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("message_templates")
        .update({
          title: data.title,
          body: data.body,
          default_channel_id: data.default_channel_id ?? null,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("message_templates")
      .insert({
        key: data.key,
        title: data.title,
        body: data.body,
        default_channel_id: data.default_channel_id ?? null,
        is_system: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (inserted as { id: string }).id };
  });

export const deleteMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("message_templates")
      .delete()
      .eq("id", data.id)
      .eq("is_system", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type DiscordChannel = { id: string; name: string; type: number; position: number };

export const listDiscordChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiscordChannel[]> => {
    await assertAdmin(context.userId);
    const guildId = process.env.DISCORD_GUILD_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!guildId || !botToken) throw new Error("Discord bot ikke konfigureret.");
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Discord ${res.status}: ${t}`);
    }
    const all = (await res.json()) as DiscordChannel[];
    // Only text channels (0) and announcement (5)
    return all
      .filter((c) => c.type === 0 || c.type === 5)
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, name: c.name, type: c.type, position: c.position }));
  });

const postSchema = z.object({
  templateId: z.string().uuid(),
  channelId: z.string().trim().min(5),
});

export const postTemplateToDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => postSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tpl, error } = await supabaseAdmin
      .from("message_templates")
      .select("*")
      .eq("id", data.templateId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tpl) throw new Error("Skabelon ikke fundet.");
    const t = tpl as MessageTemplate;

    const inviteUrl = process.env.DISCORD_INVITE_URL ?? "";
    const body = t.body.replace(/\{discord_invite\}/g, inviteUrl);
    const content = `**${t.title}**\n\n${body}`;

    const { sendDiscordChannelMessage } = await import("./discord.server");
    const res = await sendDiscordChannelMessage(data.channelId, content);
    if (!res.ok) throw new Error(`Discord ${res.status}: ${res.message ?? ""}`);
    return { ok: true, messageId: res.messageId };
  });

