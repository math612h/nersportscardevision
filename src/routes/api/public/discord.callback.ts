import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/discord/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const origin = "https://lmudanmark.dk";

        const redirectToProfile = (status: "ok" | "error", message?: string) => {
          const target = new URL("/profil", origin);
          target.searchParams.set("discord", status);
          if (message) target.searchParams.set("discord_msg", message);
          return Response.redirect(target.toString(), 302);
        };

        const redirectToLogin = (message: string) => {
          const target = new URL("/login", origin);
          target.searchParams.set("discord", "error");
          target.searchParams.set("discord_msg", message);
          return Response.redirect(target.toString(), 302);
        };

        const redirectNotMember = (mode: "login" | "link") => {
          const invite = process.env.DISCORD_INVITE_URL ?? "";
          const target = new URL(mode === "link" ? "/profil" : "/login", origin);
          target.searchParams.set("discord", "not_member");
          if (invite) target.searchParams.set("discord_invite", invite);
          return Response.redirect(target.toString(), 302);
        };

        if (!code || !state) return redirectToLogin("Mangler kode eller state");

        try {
          const { verifyDiscordState, exchangeDiscordCode, fetchDiscordGuildMember } = await import("@/lib/discord.server");
          const verified = await verifyDiscordState(state);
          if (!verified) return redirectToLogin("Ugyldig eller udløbet state");

          const { discord_user_id, discord_username, discord_server_nickname, discord_email, discord_avatar_url } = await exchangeDiscordCode(code, origin);

          // Krav: brugeren skal være medlem af LMU Danmark Discord-serveren
          const guildMember = await fetchDiscordGuildMember(discord_user_id);
          if (!guildMember) {
            return redirectNotMember(verified.mode === "link" ? "link" : "login");
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // -------- LINK MODE (existing signed-in user) --------
          if (verified.mode === "link" && verified.userId) {
            const { data: existing } = await supabaseAdmin
              .from("profiles_private")
              .select("user_id")
              .eq("discord_user_id", discord_user_id)
              .maybeSingle();
            if (existing && (existing as { user_id: string }).user_id !== verified.userId) {
              return redirectToProfile("error", "Den Discord-konto er allerede tilknyttet en anden bruger");
            }
            const { error } = await supabaseAdmin
              .from("profiles_private")
              .upsert(
                {
                  user_id: verified.userId,
                  discord_user_id,
                  discord_username,
                  discord_server_nickname,
                  discord_linked_at: new Date().toISOString(),
                },
                { onConflict: "user_id" },
              );
            if (error) return redirectToProfile("error", error.message);
            if (discord_avatar_url) {
              await supabaseAdmin
                .from("profiles")
                .update({ discord_avatar_url })
                .eq("id", verified.userId);
            }
            return redirectToProfile("ok");
          }

          // -------- LOGIN MODE (anonymous) --------
          // 1) Already linked → log that user in
          const { data: linked } = await supabaseAdmin
            .from("profiles_private")
            .select("user_id")
            .eq("discord_user_id", discord_user_id)
            .maybeSingle();

          let targetUserId: string | null = (linked as { user_id: string } | null)?.user_id ?? null;
          let isNewUser = false;

          if (!targetUserId) {
            // 2) Not linked: try to match an existing account by Discord email
            const emailLower = discord_email?.toLowerCase() ?? null;
            if (emailLower) {
              const { data: byEmail } = await supabaseAdmin.rpc("admin_find_user_id_by_email", {
                _email: emailLower,
              });
              if (typeof byEmail === "string") targetUserId = byEmail;
            }

            // 3) Still nothing: create a brand new auth user
            if (!targetUserId) {
              const email = discord_email ?? `discord-${discord_user_id}@no-email.lmudanmark.dk`;
              const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: { display_name: discord_username },
              });
              if (createErr || !created.user) {
                return redirectToLogin(createErr?.message ?? "Kunne ikke oprette bruger");
              }
              targetUserId = created.user.id;
              isNewUser = true;
            }

            // Link Discord to that user
            const { error: linkErr } = await supabaseAdmin
              .from("profiles_private")
              .upsert(
                {
                  user_id: targetUserId,
                  discord_user_id,
                  discord_username,
                  discord_server_nickname,
                  discord_linked_at: new Date().toISOString(),
                },
                { onConflict: "user_id" },
              );
            if (linkErr) return redirectToLogin(linkErr.message);
          }

          if (discord_avatar_url && targetUserId) {
            await supabaseAdmin
              .from("profiles")
              .update({ discord_avatar_url })
              .eq("id", targetUserId);
          }

          // Notify admins as soon as a not-yet-approved user has linked Discord
          // (previously this only fired when they finished onboarding).
          if (targetUserId) {
            try {
              const { data: prof } = await supabaseAdmin
                .from("profiles")
                .select("approved, display_name, lmu_name")
                .eq("id", targetUserId)
                .maybeSingle();
              const p = prof as { approved?: boolean | null; display_name?: string | null; lmu_name?: string | null } | null;
              const { data: privRow } = await supabaseAdmin
                .from("profiles_private")
                .select("pending_discord_message_id")
                .eq("user_id", targetUserId)
                .maybeSingle();
              const alreadyPosted = (privRow as { pending_discord_message_id?: string | null } | null)?.pending_discord_message_id;
              if (p && p.approved !== true && !alreadyPosted) {
                const ADMIN_ROLE_ID = "1336285632066097233";
                const content =
                  `<@&${ADMIN_ROLE_ID}> **Ny bruger afventer godkendelse**\n` +
                  `Navn: ${p.display_name ?? discord_username}\n` +
                  `LMU: ${p.lmu_name || "(mangler endnu)"}\n` +
                  `Discord: ${discord_server_nickname || discord_username}`;
                const { sendDiscordChannelMessage } = await import("@/lib/discord.server");
                const res = await sendDiscordChannelMessage("1516138512209018890", content, [ADMIN_ROLE_ID]);
                if (res.ok && res.messageId) {
                  await supabaseAdmin
                    .from("profiles_private")
                    .update({ pending_discord_message_id: res.messageId })
                    .eq("user_id", targetUserId);
                }
              }
            } catch (e) {
              console.error("pending-approval notify (callback) failed", e);
            }
          }


          // Generate a magic link to actually sign the user in (creates a real session).
          // We need the email currently on the auth user.
          const { data: userRes, error: getErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
          if (getErr || !userRes.user?.email) {
            return redirectToLogin(getErr?.message ?? "Kunne ikke hente bruger");
          }
          const redirectTo = new URL(isNewUser ? "/onboarding" : "/", origin).toString();
          const { data: linkData, error: linkGenErr } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: userRes.user.email,
            options: { redirectTo },
          });
          if (linkGenErr || !linkData.properties?.action_link) {
            return redirectToLogin(linkGenErr?.message ?? "Kunne ikke generere login-link");
          }
          return Response.redirect(linkData.properties.action_link, 302);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Ukendt fejl";
          console.error("Discord callback failed", e);
          return redirectToLogin(msg);
        }
      },
    },
  },
});
