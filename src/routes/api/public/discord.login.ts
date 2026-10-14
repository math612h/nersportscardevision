import { createFileRoute } from "@tanstack/react-router";

// Starts Discord OAuth in "login" mode (no signed-in user yet).
export const Route = createFileRoute("/api/public/discord/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { signDiscordState, buildDiscordAuthUrl, resolveDiscordOrigin } = await import("@/lib/discord.server");
        const origin = resolveDiscordOrigin(request.url);
        const state = await signDiscordState("login", null);
        const url = buildDiscordAuthUrl(state, origin);
        return Response.redirect(url, 302);
      },
    },
  },
});
