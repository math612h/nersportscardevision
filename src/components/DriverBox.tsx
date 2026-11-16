import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isResultsPublished } from "@/lib/results-visibility";
import { aggregateStandings, driverDuel, type StandingsEntry } from "@/lib/league-standings";

// Personlig "Driver Boks" på forsiden: kørerens klasse, placering og point,
// samt køreren lige foran og lige bagved med pointforskel.
export function DriverBox({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const userId = user?.id;

  const { data } = useQuery({
    queryKey: ["home-driver-box", leagueId, userId ?? "anon"],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: myEntries }, { data: league }] = await Promise.all([
        supabase
          .from("entries")
          .select("car_class,driver_category,car_number,waitlist,division_id")
          .eq("league_id", leagueId)
          .eq("user_id", userId!)
          .is("withdrawn_at", null),
        supabase.from("leagues").select("points_system,separate_division_standings").eq("id", leagueId).maybeSingle(),
      ]);
      const entry = (myEntries ?? []).find((e: any) => e.car_class && !e.waitlist && !e.division_id);
      if (!entry || (league as any)?.separate_division_standings) return null;

      const [{ data: divisions }, { data: leagueEntries }] = await Promise.all([
        supabase.from("divisions").select("id,settings,race_date").eq("league_id", leagueId).order("race_date", { ascending: true, nullsFirst: false }),
        supabase.from("entries").select("user_id,car_class,driver_category,car_number,withdrawn_at,division_id").eq("league_id", leagueId),
      ]);
      const completed = (divisions ?? []).filter(
        (d: any) => d.settings?.completed && isResultsPublished(d.settings) && Array.isArray(d.settings?.results),
      );
      const dropRounds = Math.max(0, Number((league?.points_system as any)?.drop_rounds ?? 0)) || 0;
      const entries = (leagueEntries ?? []) as (StandingsEntry & { withdrawn_at: string | null; division_id: string | null })[];
      const allRows = aggregateStandings(completed, entries, dropRounds);
      // Vis kørerens aktuelle bilnummer (ikke nødvendigvis nummeret fra første resultat).
      const currentNumber = new Map<string, number>();
      for (const e of entries) {
        if (!e.withdrawn_at && !e.division_id && e.car_number != null) currentNumber.set(`${e.user_id}|${e.car_class}`, e.car_number);
      }
      const rows = allRows.filter((r) => r.car_class === entry.car_class && r.driver_category === (entry.driver_category ?? ""));
      const duel = driverDuel(rows, userId!, (r) => (r.user_id ? currentNumber.get(`${r.user_id}|${r.car_class}`) : undefined) ?? r.car_number);
      return {
        carClass: entry.car_class as string,
        category: (entry.driver_category ?? "") as string,
        carNumber: entry.car_number as number | null,
        duel,
      };
    },
  });

  if (!data) return null;
  const { duel } = data;

  return (
    <section>
      <Link
        to="/ligaer/$leagueId/stillinger"
        params={{ leagueId }}
        className="group block rounded-xl border border-border bg-card p-3 transition hover:border-primary"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Trophy className="h-3 w-3 text-primary" /> Din stilling
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {data.carClass}{data.category ? ` ${data.category}` : ""}{data.carNumber != null ? ` · #${data.carNumber}` : ""}
          </p>
        </div>

        {!duel ? (
          <p className="mt-2 text-sm text-muted-foreground">Ingen offentliggjorte resultater endnu — din første afdeling sætter dig på tavlen.</p>
        ) : (
          <div className="mt-2 space-y-1">
            {duel.ahead && (
              <NeighbourRow
                pos={duel.position - 1}
                name={duel.ahead.name}
                carNumber={duel.ahead.carNumber}
                gap={`+${duel.ahead.gap} pt`}
                icon={<ChevronUp className="h-3 w-3" />}
              />
            )}
            <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-2">
              <span className="w-8 shrink-0 font-mono text-lg font-black tabular-nums text-primary">P{duel.position}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">Dig</span>
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-primary">{duel.total} pt</span>
            </div>
            {duel.behind && (
              <NeighbourRow
                pos={duel.position + 1}
                name={duel.behind.name}
                carNumber={duel.behind.carNumber}
                gap={`−${duel.behind.gap} pt`}
                icon={<ChevronDown className="h-3 w-3" />}
              />
            )}
          </div>
        )}

        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary transition group-hover:translate-x-0.5">
          Se stillinger <ArrowUpRight className="h-3 w-3" />
        </span>
      </Link>
    </section>
  );
}

function NeighbourRow({ pos, name, carNumber, gap, icon }: { pos: number; name: string; carNumber: number | null; gap: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-2.5 py-1 text-muted-foreground">
      <span className="w-8 shrink-0 font-mono text-xs font-semibold tabular-nums">P{pos}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs">
        {icon}
        <span className="truncate text-foreground/80">{name}</span>
        {carNumber != null && <span className="shrink-0 font-mono text-[10px]">#{carNumber}</span>}
      </span>
      <span className="shrink-0 font-mono text-xs tabular-nums">{gap}</span>
    </div>
  );
}
