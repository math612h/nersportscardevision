import { createFileRoute } from "@tanstack/react-router";

async function run() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendRatingRequestDM } = await import("@/lib/coaching-discord.server");
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: bookings } = await supabaseAdmin
      .from("coaching_bookings")
      .select("id, starts_at, duration_minutes, status, rating_request_sent_at")
      .is("rating_request_sent_at", null)
      .gte("starts_at", weekAgo)
      .in("status", ["confirmed", "completed"])
      .limit(200);

    let sent = 0;
    let skipped = 0;
    for (const b of bookings ?? []) {
      const endsAt = new Date(b.starts_at).getTime() + (b.duration_minutes ?? 0) * 60_000;
      if (endsAt > now.getTime()) continue;

      // Skip if a rating already exists
      const { data: existing } = await supabaseAdmin
        .from("coaching_ratings").select("id").eq("booking_id", b.id).maybeSingle();
      if (existing) {
        await supabaseAdmin.from("coaching_bookings")
          .update({ rating_request_sent_at: new Date().toISOString() })
          .eq("id", b.id);
        skipped += 1;
        continue;
      }

      const res = await sendRatingRequestDM(b.id);
      if (res.ok) sent += 1; else skipped += 1;
    }
    return Response.json({ ok: true, sent, skipped });
  } catch (e: any) {
    console.error("coaching-rating-requests failed", e);
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/coaching-rating-requests")({
  server: {
    handlers: {
      POST: async () => run(),
      GET: async () => run(),
    },
  },
});
