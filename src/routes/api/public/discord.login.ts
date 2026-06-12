import { createFileRoute } from "@tanstack/react-router";

// Starts Discord OAuth in "login" mode (no signed-in user yet).
export const Route = createFileRoute("/api/public/discord/login")({
  server: {
    handlers: {
      GET: async () => {
        const { signDiscordState, buildDiscordAuthUrl } = await import("@/lib/discord.server");
        const origin = "https://lmudanmark.dk";
        const state = await signDiscordState("login", null);
        const url = buildDiscordAuthUrl(state, origin);
        return Response.redirect(url, 302);
      },
    },
  },
});
