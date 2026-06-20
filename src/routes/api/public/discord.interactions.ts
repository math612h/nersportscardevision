import { createFileRoute } from "@tanstack/react-router";

// Discord interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const MODAL_SUBMIT = 5;

// Discord response types
const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;
const UPDATE_MESSAGE = 7;
const MODAL = 9;

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

          // Welcome flow: button → open modal with first/last name fields
          if (customId === "welcome_name") {
            return Response.json({
              type: MODAL,
              data: {
                custom_id: "welcome_name_modal",
                title: "Skriv dit navn",
                components: [
                  {
                    type: 1,
                    components: [
                      {
                        type: 4,
                        custom_id: "first_name",
                        label: "Fornavn",
                        style: 1,
                        required: true,
                        min_length: 1,
                        max_length: 30,
                      },
                    ],
                  },
                  {
                    type: 1,
                    components: [
                      {
                        type: 4,
                        custom_id: "last_name",
                        label: "Efternavn",
                        style: 1,
                        required: true,
                        min_length: 1,
                        max_length: 30,
                      },
                    ],
                  },
                ],
              },
            });
          }

          // Hosted session flow: button → open modal
          if (customId === "host_session_share") {
            return Response.json({
              type: MODAL,
              data: {
                custom_id: "host_session_share_modal",
                title: "Del din hosted session",
                components: [
                  { type: 1, components: [{ type: 4, custom_id: "server_name", label: "Server-navn", style: 1, required: true, min_length: 1, max_length: 80 }] },
                  { type: 1, components: [{ type: 4, custom_id: "server_code", label: "Server-kode", style: 1, required: true, min_length: 1, max_length: 40 }] },
                  { type: 1, components: [{ type: 4, custom_id: "lobby_code", label: "Lobby-kode", style: 1, required: true, min_length: 1, max_length: 40 }] },
                  { type: 1, components: [{ type: 4, custom_id: "start_time", label: "Starter kl. (HH:MM)", style: 1, required: true, min_length: 4, max_length: 5, placeholder: "20:30" }] },
                  { type: 1, components: [{ type: 4, custom_id: "end_time", label: "Slutter kl. (HH:MM)", style: 1, required: true, min_length: 4, max_length: 5, placeholder: "22:00" }] },
                ],
              },
            });
          }

          const [kind, invitationId] = customId.split(":");
          if (
            (kind === "team_invite_accept" || kind === "team_invite_reject") &&
            invitationId &&
            discordUserId
          ) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

          return Response.json({
            type: CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: FLAG_EPHEMERAL, content: "Ukendt handling." },
          });
        }

        if (payload?.type === MODAL_SUBMIT) {
          const customId: string = payload?.data?.custom_id ?? "";
          const discordUserId: string | undefined =
            payload?.member?.user?.id ?? payload?.user?.id;

          if (customId === "welcome_name_modal" && discordUserId) {
            const rows = (payload?.data?.components ?? []) as Array<{
              components: Array<{ custom_id: string; value: string }>;
            }>;
            const values: Record<string, string> = {};
            for (const row of rows) {
              for (const c of row.components ?? []) {
                values[c.custom_id] = (c.value ?? "").trim();
              }
            }
            const firstName = (values.first_name ?? "").replace(/\s+/g, " ").trim();
            const lastName = (values.last_name ?? "").replace(/\s+/g, " ").trim();

            const cap = (s: string) =>
              s
                .split(" ")
                .filter(Boolean)
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" ");
            const fullName = `${cap(firstName)} ${cap(lastName)}`.trim();

            if (!firstName || !lastName) {
              return Response.json({
                type: CHANNEL_MESSAGE_WITH_SOURCE,
                data: { flags: FLAG_EPHEMERAL, content: "Du skal udfylde både fornavn og efternavn." },
              });
            }

            const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID;
            if (!memberRoleId) {
              return Response.json({
                type: CHANNEL_MESSAGE_WITH_SOURCE,
                data: { flags: FLAG_EPHEMERAL, content: "Server-konfiguration mangler. Kontakt en admin." },
              });
            }

            const { setGuildMemberNickname, addGuildRole } = await import("@/lib/discord.server");

            const nickRes = await setGuildMemberNickname(discordUserId, fullName);
            // Discord returnerer 403 hvis brugeren er server-ejer eller har en
            // rolle højere end botten — det kan vi ikke omgå. Vi fortsætter
            // alligevel (gemmer navnet i DB + tildeler rolle) og beder brugeren
            // selv sætte sit kælenavn.
            const nickFailedDueToHierarchy = !nickRes.ok && nickRes.status === 403;
            if (!nickRes.ok && !nickFailedDueToHierarchy) {
              return Response.json({
                type: CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  flags: FLAG_EPHEMERAL,
                  content: `Kunne ikke sætte dit navn (${nickRes.status}). Kontakt en admin.`,
                },
              });
            }

            // Sync navnet til hjemmesiden hvis Discord-kontoen er koblet til en profil
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data: priv } = await (supabaseAdmin as any)
                .from("profiles_private")
                .select("user_id")
                .eq("discord_user_id", discordUserId)
                .maybeSingle();
              const linkedUserId = (priv as { user_id?: string } | null)?.user_id;
              if (linkedUserId) {
                await supabaseAdmin
                  .from("profiles_private")
                  .update({ discord_server_nickname: fullName })
                  .eq("user_id", linkedUserId);
                await supabaseAdmin
                  .from("profiles")
                  .update({ display_name: fullName })
                  .eq("id", linkedUserId);
              }
            } catch (e) {
              console.error("welcome_name profile sync failed", e);
            }

            const roleRes = await addGuildRole(discordUserId, memberRoleId);
            if (!roleRes.ok) {
              return Response.json({
                type: CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  flags: FLAG_EPHEMERAL,
                  content: `Dit navn er sat til **${fullName}**, men adgang kunne ikke gives (${roleRes.status}). Kontakt en admin.`,
                },
              });
            }

            return Response.json({
              type: CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                flags: FLAG_EPHEMERAL,
                content: nickFailedDueToHierarchy
                  ? `✅ Velkommen, **${fullName}**! Du har nu adgang til serveren.\n\nDit kælenavn kunne ikke sættes automatisk (du har en højere rolle end botten, fx ejer/admin) — opdatér det selv under serverindstillinger.`
                  : `✅ Velkommen, **${fullName}**! Du har nu adgang til resten af serveren.`,
              },
            });
          }

          return Response.json({
            type: CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: FLAG_EPHEMERAL, content: "Ukendt formular." },
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
