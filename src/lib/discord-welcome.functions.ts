import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WELCOME_TEXT = [
  "👋 **Velkommen til LMU Danmark!**",
  "",
  "For at få adgang til resten af serveren skal du skrive dit **rigtige fornavn og efternavn**.",
  "**Det er IKKE tilladt at anvende gamer tags, forkortelser eller noget som helst andet end sit rigtige for- og efternavn.**",
  "Det gør det nemmere for alle at vide hvem der er hvem på racerbanen.",
  "",
  "Klik på knappen herunder og udfyld felterne.",
].join("\n");

export const postDiscordWelcomeMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins.");

    const channelId = process.env.DISCORD_WELCOME_CHANNEL_ID;
    if (!channelId) throw new Error("DISCORD_WELCOME_CHANNEL_ID mangler.");
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) throw new Error("DISCORD_BOT_TOKEN mangler.");

    const body = {
      content: WELCOME_TEXT,
      allowed_mentions: { parse: [] as string[] },
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: "Skriv dit navn",
              custom_id: "welcome_name",
              emoji: { name: "✏️" },
            },
          ],
        },
      ],
    };

    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status !== 200 && res.status !== 201) {
      const t = await res.text().catch(() => "");
      throw new Error(`Discord-svar ${res.status}: ${t}`);
    }
    return { ok: true as const };
  });
