import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/discord/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const origin = url.origin;

        const redirectTo = (status: "ok" | "error", message?: string) => {
          const target = new URL("/profil", origin);
          target.searchParams.set("discord", status);
          if (message) target.searchParams.set("discord_msg", message);
          return Response.redirect(target.toString(), 302);
        };

        if (!code || !state) return redirectTo("error", "Mangler kode eller state");

        try {
          const { verifyDiscordState, exchangeDiscordCode } = await import("@/lib/discord.server");
          const verified = await verifyDiscordState(state);
          if (!verified) return redirectTo("error", "Ugyldig eller udløbet state");

          const { discord_user_id, discord_username } = await exchangeDiscordCode(code, origin);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Block if already linked to another user
          const { data: existing } = await supabaseAdmin
            .from("profiles_private")
            .select("user_id")
            .eq("discord_user_id", discord_user_id)
            .maybeSingle();
          if (existing && (existing as { user_id: string }).user_id !== verified.userId) {
            return redirectTo("error", "Den Discord-konto er allerede tilknyttet en anden bruger");
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
          if (error) return redirectTo("error", error.message);

          return redirectTo("ok");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Ukendt fejl";
          console.error("Discord callback failed", e);
          return redirectTo("error", msg);
        }
      },
    },
  },
});
