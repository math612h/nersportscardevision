import { createFileRoute } from "@tanstack/react-router";
import { authorizeCron } from "@/lib/cron-auth.server";
import { expireStaleReserveOffersImpl } from "@/lib/division-reserves.functions";

async function run() {
  try {
    const res = await expireStaleReserveOffersImpl();
    return Response.json({ ok: true, ...res });
  } catch (e: any) {
    console.error("expire-reserve-offers failed", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/cron/expire-reserve-offers")({
  server: {
    handlers: {
      POST: async ({ request }) => (await authorizeCron(request)) ?? (await run()),
      GET: async ({ request }) => (await authorizeCron(request)) ?? (await run()),
    },
  },
});
