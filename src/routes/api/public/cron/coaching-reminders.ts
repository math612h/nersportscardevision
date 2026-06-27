import { createFileRoute } from "@tanstack/react-router";
import { sendCoachingReminders } from "@/lib/coaching-discord.server";

function authorize(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Server misconfigured" }, { status: 500 });
  const header = request.headers.get("x-cron-secret");
  if (!header || header !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

async function run() {
  try {
    const res = await sendCoachingReminders();
    return Response.json({ ok: true, ...res });
  } catch (e: any) {
    console.error("coaching-reminders failed", e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/coaching-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => authorize(request) ?? (await run()),
      GET: async ({ request }) => authorize(request) ?? (await run()),
    },
  },
});
