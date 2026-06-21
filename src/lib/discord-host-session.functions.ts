import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const HOST_SESSION_CHANNEL_ID = "1516157149443657930";

const ANCHOR_TEXT = [
  "🎮 **Del din hosted session**",
  "",
  "Hoster du en session lige nu eller snart? Klik på knappen herunder og udfyld:",
  "• Server-navn",
  "• Server-kode",
  "• Lobby-kode (valgfri)",
  "• Starter kl. (fx 20:30)",
  "• Slutter kl. (fx 22:00)",
  "",
  "Så vises din session i kanalen med en live nedtælling, så alle kan se om den stadig er aktiv.",
].join("\n");

export const postHostSessionAnchor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins.");

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) throw new Error("DISCORD_BOT_TOKEN mangler.");

    const body = {
      content: ANCHOR_TEXT,
      allowed_mentions: { parse: [] as string[] },
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: "Del din hosted session",
              custom_id: "host_session_share",
              emoji: { name: "🎮" },
            },
          ],
        },
      ],
    };

    const res = await fetch(
      `https://discord.com/api/v10/channels/${HOST_SESSION_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (res.status !== 200 && res.status !== 201) {
      const t = await res.text().catch(() => "");
      throw new Error(`Discord-svar ${res.status}: ${t}`);
    }
    return { ok: true as const };
  });
