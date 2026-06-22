import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  display_name: z.string().trim().min(1).max(80),
  lmu_name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  accepts_danish: z.boolean(),
  address: z.string().trim().max(200).optional().default(""),
  postal_code: z.string().trim().max(20).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  country: z.string().trim().max(100).optional().default("Danmark"),
  address_consent: z.boolean().optional().default(false),
  media_consent: z.boolean(),
});

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Must have Discord linked first
    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const discordId = (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;
    if (!discordId) throw new Error("Du skal tilknytte Discord først.");

    // Update auth email if it differs
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const currentEmail = userRes.user?.email ?? "";
    if (currentEmail.toLowerCase() !== data.email.toLowerCase()) {
      const { error: emailErr } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        email: data.email,
        email_confirm: true,
      });
      if (emailErr) throw new Error(emailErr.message);
    }

    if (!data.accepts_danish) throw new Error("Du skal bekræfte at du kan læse og skrive dansk.");
    if (!data.media_consent) throw new Error("Du skal acceptere brug af navn/billeder på stream og SoMe.");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        display_name: data.display_name,
        lmu_name: data.lmu_name,
        accepts_danish: true,
        media_consent: true,
      } as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    const hasAddress = !!(data.address && data.address.length > 0);
    const { error: privUpdErr } = await supabaseAdmin
      .from("profiles_private")
      .update({
        address: hasAddress ? data.address : null,
        postal_code: hasAddress ? (data.postal_code || null) : null,
        city: hasAddress ? (data.city || null) : null,
        country: hasAddress ? (data.country || "Danmark") : null,
        address_consent_at: hasAddress && data.address_consent ? new Date().toISOString() : null,
      } as never)
      .eq("user_id", context.userId);
    if (privUpdErr) throw new Error(privUpdErr.message);

    // Check current approval status to decide which notifications to send
    const { data: currentProfile } = await supabaseAdmin
      .from("profiles")
      .select("approved")
      .eq("id", context.userId)
      .maybeSingle();
    const isApproved = (currentProfile as { approved?: boolean | null } | null)?.approved === true;

    // Fetch the LIVE Discord server-nickname (don't rely on cached value, which
    // can be stale if the user just renamed themselves on the Discord server).
    const { fetchDiscordGuildMember } = await import("./discord.server");
    let liveServerNick: string | null = null;
    let liveUsername: string | null = null;
    try {
      const member = await fetchDiscordGuildMember(discordId);
      liveServerNick = member?.nick ?? null;
      liveUsername = member?.user?.global_name || member?.user?.username || null;
      await supabaseAdmin
        .from("profiles_private")
        .update({
          discord_server_nickname: liveServerNick,
          ...(liveUsername ? { discord_username: liveUsername } : {}),
        })
        .eq("user_id", context.userId);
    } catch (e) {
      console.error("live discord member fetch failed", e);
    }
    if (!liveUsername) {
      const { data: priv2 } = await supabaseAdmin
        .from("profiles_private")
        .select("discord_username")
        .eq("user_id", context.userId)
        .maybeSingle();
      liveUsername = (priv2 as { discord_username?: string | null } | null)?.discord_username ?? null;
    }
    const discordName = liveServerNick || liveUsername || "(intet Discord-navn)";

    const ADMIN_ROLE_ID = "1336285632066097233";
    try {
      const { data: notifs } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", context.userId)
        .eq("title", "Opdater dit navn for at blive godkendt");
      if (notifs && notifs.length > 0) {
        const content =
          `<@&${ADMIN_ROLE_ID}> **Bruger har opdateret sine oplysninger**\n` +
          `Discord: ${discordName}\n` +
          `LMU: ${data.lmu_name}\n` +
          `Navn: ${data.display_name}`;
        const { sendDiscordChannelMessage } = await import("./discord.server");
        await sendDiscordChannelMessage("1515719754797678744", content, [ADMIN_ROLE_ID]);
        await supabaseAdmin
          .from("notifications")
          .delete()
          .eq("user_id", context.userId)
          .eq("title", "Opdater dit navn for at blive godkendt");
      }
    } catch (e) {
      console.error("admin name-update notify failed", e);
    }

    if (!isApproved) {
      try {
        const content =
          `<@&${ADMIN_ROLE_ID}> **Ny bruger afventer godkendelse**\n` +
          `Navn: ${data.display_name}\n` +
          `LMU: ${data.lmu_name}\n` +
          `Discord: ${discordName}`;
        const { sendDiscordChannelMessage } = await import("./discord.server");
        const res = await sendDiscordChannelMessage("1516138512209018890", content, [ADMIN_ROLE_ID]);
        if (res.ok && res.messageId) {
          await supabaseAdmin
            .from("profiles_private")
            .update({ pending_discord_message_id: res.messageId })
            .eq("user_id", context.userId);
        }
      } catch (e) {
        console.error("pending-approval notify failed", e);
      }
    }


    return { ok: true };
  });
