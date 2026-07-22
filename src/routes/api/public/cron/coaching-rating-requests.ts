import { createFileRoute } from "@tanstack/react-router";

async function run() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Find sessions that ended in the last 24h, not yet asked, and not cancelled/rejected.
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data: bookings } = await supabaseAdmin
      .from("coaching_bookings")
      .select("id, user_id, coach_user_id, starts_at, duration_minutes, status, rating_request_sent_at")
      .is("rating_request_sent_at", null)
      .gte("starts_at", dayAgo)
      .in("status", ["confirmed", "accepted", "completed"]) // ignore cancelled/rejected
      .limit(200);

    let sent = 0;
    for (const b of bookings ?? []) {
      const endsAt = new Date(b.starts_at).getTime() + (b.duration_minutes ?? 0) * 60_000;
      if (endsAt > now.getTime()) continue;

      // Check no rating exists yet
      const { data: existing } = await supabaseAdmin
        .from("coaching_ratings").select("id").eq("booking_id", b.id).maybeSingle();
      if (existing) {
        await supabaseAdmin.from("coaching_bookings")
          .update({ rating_request_sent_at: new Date().toISOString() })
          .eq("id", b.id);
        continue;
      }

      // Load coach name
      const { data: coach } = await supabaseAdmin
        .from("profiles").select("display_name").eq("id", b.coach_user_id).maybeSingle();

      await supabaseAdmin.from("notifications").insert({
        user_id: b.user_id,
        title: "Hvordan gik din coaching-session?",
        body: `Giv ${coach?.display_name ?? "din coach"} en stjernebedømmelse — det tager 20 sekunder.`,
        link: `/coaching/rate/${b.id}`,
      });

      await supabaseAdmin.from("coaching_bookings")
        .update({ rating_request_sent_at: new Date().toISOString() })
        .eq("id", b.id);
      sent += 1;
    }
    return Response.json({ ok: true, sent });
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
