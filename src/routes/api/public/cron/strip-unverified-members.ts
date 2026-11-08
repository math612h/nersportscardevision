import { createFileRoute } from "@tanstack/react-router";
import { authorizeCron } from "@/lib/cron-auth.server";
import { stripNewJoinersImpl } from "@/lib/discord-strip-unverified.functions";

async function run() {
  try {
    const res = await stripNewJoinersImpl();
    return Response.json({ ok: true, ...res });
  } catch (e) {
    console.error("strip-unverified-members failed", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const Route = createFileRoute("/api/public/cron/strip-unverified-members")({
  server: {
    handlers: {
      POST: async ({ request }) => (await authorizeCron(request)) ?? (await run()),
      GET: async ({ request }) => (await authorizeCron(request)) ?? (await run()),
    },
  },
});
