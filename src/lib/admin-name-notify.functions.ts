import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_CHANNEL_ID = "1515719754797678744";
const WRONG_NAME_TITLE = "Opdater dit navn for at blive godkendt";

export const notifyAdminNameUpdated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Only notify if a "wrong_name" notification was previously sent to this user
    const { data: notifs } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("title", WRONG_NAME_TITLE);
    if (!notifs || notifs.length === 0) return { ok: true, notified: false };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, lmu_name")
      .eq("id", userId)
      .maybeSingle();
    const { data: priv } = await supabaseAdmin
      .from("profiles_private")
      .select("discord_username, discord_server_nickname")
      .eq("user_id", userId)
      .maybeSingle();

    const discordName = (priv as { discord_server_nickname?: string | null; discord_username?: string | null } | null)?.discord_server_nickname
      || (priv as { discord_server_nickname?: string | null; discord_username?: string | null } | null)?.discord_username
      || "(intet Discord-navn)";
    const lmuName = (profile as { lmu_name?: string | null } | null)?.lmu_name ?? "(intet LMU-navn)";
    const displayName = (profile as { display_name?: string | null } | null)?.display_name ?? "(intet navn)";

    const content =
      `**Bruger har opdateret sine oplysninger**\n` +
      `Discord: ${discordName}\n` +
      `LMU: ${lmuName}\n` +
      `Navn: ${displayName}`;

    let sendResult: { ok: boolean; status: number; message?: string } = { ok: false, status: 0 };
    try {
      const { sendDiscordChannelMessage } = await import("./discord.server");
      sendResult = await sendDiscordChannelMessage(ADMIN_CHANNEL_ID, content);
      console.log("[notifyAdminNameUpdated] discord send", sendResult);
    } catch (e) {
      console.error("[notifyAdminNameUpdated] discord threw", e);
      return { ok: false, notified: false, error: String(e) };
    }

    if (!sendResult.ok) {
      return { ok: false, notified: false, status: sendResult.status, error: sendResult.message ?? null };
    }

    // Remove the wrong_name notifications so this only fires once per request
    await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("user_id", userId)
      .eq("title", WRONG_NAME_TITLE);

    return { ok: true, notified: true };
  });

