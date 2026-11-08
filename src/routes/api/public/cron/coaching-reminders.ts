import { createFileRoute } from "@tanstack/react-router";
import { authorizeCron } from "@/lib/cron-auth.server";

async function run() {
  try {
    const { sendCoachingReminders } = await import("@/lib/coaching-discord.server");
    const res = await sendCoachingReminders();
    return Response.json({ ok: true, ...res });
  } catch (e: any) {
    console.error("coaching-reminders failed", e);
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/coaching-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => (await authorizeCron(request)) ?? (await run()),
      GET: async ({ request }) => (await authorizeCron(request)) ?? (await run()),
    },
  },
});
