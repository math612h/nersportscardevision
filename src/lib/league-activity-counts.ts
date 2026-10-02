import type { SupabaseClient } from "@supabase/supabase-js";

/** localStorage key that stores the ISO timestamp of the last time an admin viewed the activity log for a league. */
export const activitySeenKey = (leagueId: string) => `lmu_activity_seen_${leagueId}`;

/**
 * Lightweight count of activity events for a league (badge use).
 * Counts: entry audit_log rows, lineup additions/removals, absences and reserve offers since `sinceIso`.
 * When `sinceIso` is null, counts everything.
 */
export async function countLeagueActivityEvents(
  supabase: SupabaseClient,
  leagueId: string,
  sinceIso: string | null,
): Promise<number> {
  const since = sinceIso ?? "1970-01-01T00:00:00.000Z";
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
