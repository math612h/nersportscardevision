import { createFileRoute } from "@tanstack/react-router";

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
      POST: async () => run(),
      GET: async () => run(),
    },
  },
});
