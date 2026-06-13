import { createFileRoute } from "@tanstack/react-router";
import { expireStaleReserveOffersImpl } from "@/lib/division-reserves.functions";

export const Route = createFileRoute("/api/public/cron/expire-reserve-offers")({
  server: {
    handlers: {
      POST: async () => {
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
      },
      GET: async () => {
        try {
          const res = await expireStaleReserveOffersImpl();
          return Response.json({ ok: true, ...res });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
