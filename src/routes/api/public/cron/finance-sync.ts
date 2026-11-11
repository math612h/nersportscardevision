import { createFileRoute } from "@tanstack/react-router";
import { authorizeCron } from "@/lib/cron-auth.server";
import { dailyFinanceSync } from "@/lib/finance/stripe-sync.server";

export const Route = createFileRoute("/api/public/cron/finance-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authorizeCron(request);
        if (denied) return denied;
        const out: Record<string, unknown> = {};
        for (const env of ["sandbox", "live"] as const) {
          const keyName = env === "sandbox" ? "STRIPE_SANDBOX_API_KEY" : "STRIPE_LIVE_API_KEY";
          if (!process.env[keyName]) { out[env] = { skipped: "ikke opsat" }; continue; }
          out[env] = await dailyFinanceSync(env);
        }
        return Response.json({ ok: true, result: out });
      },
    },
  },
});
