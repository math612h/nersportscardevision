import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangeSchema = z.object({
  days: z.number().int().min(1).max(365).default(7),
});

type EventRow = {
  session_id: string;
  user_id: string | null;
  event_type: "pageview" | "click" | "session";
  path: string | null;
  referrer: string | null;
  duration_ms: number | null;
  created_at: string;
};

export const getAdminAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(rangeSchema)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();

    // Pull rows in pages (RLS bypassed via admin) – capped for performance.
    const all: EventRow[] = [];
    let offset = 0;
    const PAGE = 5000;
    while (true) {
      const { data: rows, error } = await supabaseAdmin
        .from("analytics_events")
        .select("session_id,user_id,event_type,path,referrer,duration_ms,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      if (!rows || rows.length === 0) break;
      all.push(...(rows as EventRow[]));
      if (rows.length < PAGE) break;
      offset += PAGE;
      if (offset > 100000) break; // hard cap
    }

    // Build daily buckets
    const days: Record<string, {
      date: string;
      visitors: Set<string>;
      pageviews: number;
      clicks: number;
      duration_ms: number;
      sessions: Set<string>;
    }> = {};

    const ensureDay = (d: string) => {
      if (!days[d]) days[d] = { date: d, visitors: new Set(), pageviews: 0, clicks: 0, duration_ms: 0, sessions: new Set() };
      return days[d];
    };

    // Seed all days in range so chart shows zero days
    for (let i = 0; i < data.days; i++) {
      const d = new Date(Date.now() - (data.days - 1 - i) * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      ensureDay(d);
    }

    const pageCounts = new Map<string, number>();
    const totalSessions = new Set<string>();
    const totalVisitors = new Set<string>();
    const usersDurationBySession = new Map<string, number>();
    const clicksBySession = new Map<string, number>();
    const uniqueUsers = new Set<string>();

    let totalPageviews = 0;
    let totalClicks = 0;
    let totalDuration = 0;

    for (const r of all) {
      const day = r.created_at.slice(0, 10);
      const bucket = ensureDay(day);
      bucket.sessions.add(r.session_id);
      bucket.visitors.add(r.user_id ?? r.session_id);
      totalSessions.add(r.session_id);
      totalVisitors.add(r.user_id ?? r.session_id);
      if (r.user_id) uniqueUsers.add(r.user_id);

      if (r.event_type === "pageview") {
        bucket.pageviews++;
        totalPageviews++;
        if (r.path) pageCounts.set(r.path, (pageCounts.get(r.path) ?? 0) + 1);
      } else if (r.event_type === "click") {
        bucket.clicks++;
        totalClicks++;
        clicksBySession.set(r.session_id, (clicksBySession.get(r.session_id) ?? 0) + 1);
      } else if (r.event_type === "session" && r.duration_ms && r.duration_ms > 0) {
        bucket.duration_ms += r.duration_ms;
        totalDuration += r.duration_ms;
        usersDurationBySession.set(
          r.session_id,
          (usersDurationBySession.get(r.session_id) ?? 0) + r.duration_ms,
        );
      }
    }

    const daily = Object.values(days)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        visitors: d.visitors.size,
        pageviews: d.pageviews,
        clicks: d.clicks,
        sessions: d.sessions.size,
        avg_duration_sec: d.sessions.size > 0 ? Math.round(d.duration_ms / d.sessions.size / 1000) : 0,
      }));

    const topPages = [...pageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([path, count]) => ({ path, count }));

    const sessionCount = totalSessions.size || 1;
    const visitorCount = totalVisitors.size;

    return {
      totals: {
        visitors: visitorCount,
        pageviews: totalPageviews,
        clicks: totalClicks,
        sessions: totalSessions.size,
        signed_in_users: uniqueUsers.size,
        avg_session_duration_sec: Math.round(totalDuration / sessionCount / 1000),
        avg_pageviews_per_session: Math.round((totalPageviews / sessionCount) * 10) / 10,
        avg_clicks_per_session: Math.round((totalClicks / sessionCount) * 10) / 10,
      },
      daily,
      topPages,
    };
  });
