import { createFileRoute } from "@tanstack/react-router";

// Discord interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;

// Discord response types
const PONG = 1;
const UPDATE_MESSAGE = 7;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;

const FLAG_EPHEMERAL = 1 << 6;

export const Route = createFileRoute("/api/public/discord/interactions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("x-signature-ed25519") ?? "";
        const timestamp = request.headers.get("x-signature-timestamp") ?? "";
        const rawBody = await request.text();

        const { verifyDiscordInteractionSignature } = await import("@/lib/discord.server");
        const valid = await verifyDiscordInteractionSignature(signature, timestamp, rawBody);
        if (!valid) return new Response("invalid request signature", { status: 401 });

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        if (payload?.type === PING) {
          return Response.json({ type: PONG });
        }

        if (payload?.type === MESSAGE_COMPONENT) {
          const customId: string = payload?.data?.custom_id ?? "";
          const discordUserId: string | undefined =
            payload?.member?.user?.id ?? payload?.user?.id;

          const [kind, invitationId] = customId.split(":");
          if (
            (kind === "team_invite_accept" || kind === "team_invite_reject") &&
            invitationId &&
            discordUserId
          ) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // Map Discord user → app user
            const { data: priv } = await (supabaseAdmin as any)
              .from("profiles_private")
              .select("user_id")
              .eq("discord_user_id", discordUserId)
              .maybeSingle();
            const appUserId = (priv as any)?.user_id as string | undefined;
            if (!appUserId) {
              return Response.json({
                type: CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  flags: FLAG_EPHEMERAL,
                  content: "Din Discord-konto er ikke koblet til en LMU Danmark-profil.",
                },
              });
            }

            const { respondToTeamInvitationCore } = await import("@/lib/team-invitations.server");
            const action = kind === "team_invite_accept" ? "accept" : "reject";
            try {
              const res = await respondToTeamInvitationCore({
                invitationId,
                action,
                actingUserId: appUserId,
              });
              const teamName = res.teamName || "teamet";
              if (res.status === "ok") {
                const text =
                  action === "accept"
                    ? `🏁 **Invitation til "${teamName}"**\n\n✅ Du har accepteret invitationen. Velkommen!`
                    : `🏁 **Invitation til "${teamName}"**\n\n❌ Du har afvist invitationen.`;
                return Response.json({
                  type: UPDATE_MESSAGE,
                  data: { content: text, components: [] },
                });
              }
              if (res.status === "already") {
                return Response.json({
                  type: UPDATE_MESSAGE,
                  data: {
                    content: `🏁 **Invitation til "${teamName}"**\n\nDenne invitation er allerede besvaret.`,
                    components: [],
                  },
                });
              }
              if (res.status === "missing") {
                return Response.json({
                  type: UPDATE_MESSAGE,
                  data: { content: "Invitationen findes ikke længere.", components: [] },
                });
              }
              return Response.json({
                type: CHANNEL_MESSAGE_WITH_SOURCE,
                data: { flags: FLAG_EPHEMERAL, content: "Du har ikke adgang til denne invitation." },
              });
            } catch (e) {
              return Response.json({
                type: CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  flags: FLAG_EPHEMERAL,
                  content: `Noget gik galt: ${(e as Error).message}`,
                },
              });
            }
          }

          // Unknown component
          return Response.json({
            type: CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: FLAG_EPHEMERAL, content: "Ukendt handling." },
          });
        }

        if (payload?.type === APPLICATION_COMMAND) {
          return Response.json({
            type: CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: FLAG_EPHEMERAL, content: "Ingen kommandoer er konfigureret." },
          });
        }

        return new Response("unsupported interaction type", { status: 400 });
      },
    },
  },
});
