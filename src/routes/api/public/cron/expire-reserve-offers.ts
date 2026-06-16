import { createFileRoute } from "@tanstack/react-router";
import { expireStaleReserveOffersImpl } from "@/lib/division-reserves.functions";

function authorize(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const header = request.headers.get("x-cron-secret");
  if (!header || header !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

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
      POST: async ({ request }) => authorize(request) ?? (await run()),
      GET: async ({ request }) => authorize(request) ?? (await run()),
    },
  },
});
