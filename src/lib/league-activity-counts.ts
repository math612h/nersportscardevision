import type { SupabaseClient } from "@supabase/supabase-js";

/** Fallback window when an admin has never opened a league's log: only the last 7 days count as new. */
export const ACTIVITY_DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Reads the admin's "last seen" marker for a league (stored per user in the database, so it follows them across devices). */
export async function getActivitySeen(supabase: SupabaseClient, leagueId: string): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await (supabase as any)
    .from("admin_activity_seen")
    .select("seen_at")
    .eq("user_id", u.user.id)
    .eq("league_id", leagueId)
    .maybeSingle();
  return (data as { seen_at?: string } | null)?.seen_at ?? null;
}

export async function markActivitySeen(supabase: SupabaseClient, leagueId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await (supabase as any)
    .from("admin_activity_seen")
    .upsert({ user_id: u.user.id, league_id: leagueId, seen_at: new Date().toISOString() });
}

/**
 * Lightweight count of activity events for a league (badge use).
 * Counts: entry audit_log rows, lineup additions/removals, absences and reserve offers since `sinceIso`.
 * When `sinceIso` is null, counts only the last 7 days.
 */
export async function countLeagueActivityEvents(
  supabase: SupabaseClient,
  leagueId: string,
  sinceIso: string | null,
): Promise<number> {
  const since = sinceIso ?? new Date(Date.now() - ACTIVITY_DEFAULT_WINDOW_MS).toISOString();
  const [audit, divsRes] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("table_name", "entries")
      .or(`new_data->>league_id.eq.${leagueId},old_data->>league_id.eq.${leagueId}`)
      .gt("created_at", since),
    supabase.from("divisions").select("id").eq("league_id", leagueId),
  ]);
  if (audit.error) throw audit.error;
  if (divsRes.error) throw divsRes.error;
  const divIds = (divsRes.data ?? []).map((d: any) => d.id);
  const empty = { count: 0 } as any;
  const [added, removed, abs, offers] = await Promise.all([
    supabase
      .from("league_team_lineup")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId)
      .gt("created_at", since),
    supabase
      .from("league_team_lineup")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId)
      .not("effective_until", "is", null)
      .gt("effective_until", since),
    divIds.length
      ? supabase
          .from("division_absences")
          .select("id", { count: "exact", head: true })
          .in("division_id", divIds)
          .gt("created_at", since)
      : Promise.resolve(empty),
    divIds.length
      ? supabase
          .from("division_reserve_offers")
          .select("id", { count: "exact", head: true })
          .in("division_id", divIds)
          .gt("created_at", since)
      : Promise.resolve(empty),
  ]);
  return (audit.count ?? 0) + (added.count ?? 0) + (removed.count ?? 0) + (abs.count ?? 0) + (offers.count ?? 0);
}
