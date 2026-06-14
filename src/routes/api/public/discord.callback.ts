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

        if (!code || !state) return redirectToLogin("Mangler kode eller state");

        try {
          const { verifyDiscordState, exchangeDiscordCode } = await import("@/lib/discord.server");
          const verified = await verifyDiscordState(state);
          if (!verified) return redirectToLogin("Ugyldig eller udløbet state");

          const { discord_user_id, discord_username, discord_email, discord_avatar_url } = await exchangeDiscordCode(code, origin);
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
