import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { KeyRound, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/PracticeSessionsList";

const HOUR = 60 * 60_000;

function endMs(s: any) {
  const mins = (s.practice_minutes ?? 0) + (s.has_qualifying ? s.qualifying_minutes ?? 0 : 0) + (s.has_race ? s.race_minutes ?? 0 : 0);
  return new Date(s.starts_at).getTime() + Math.max(mins, 30) * 60_000;
}

function cphDay(ms: number) {
  return new Date(ms).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen" });
}

export function PracticeDaySection() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: sessions } = useQuery({
    queryKey: ["home-practice-day"],
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const from = new Date(Date.now() - 12 * HOUR).toISOString();
      const to = new Date(Date.now() + 36 * HOUR).toISOString();
      const { data, error } = await supabase
        .from("division_practice_sessions")
        .select("id,division_id,server_name,has_qualifying,has_race,practice_minutes,qualifying_minutes,race_minutes,starts_at,divisions(name,track,layout,league_id,leagues(name))")
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const divIds = [...new Set(rows.map((r) => r.division_id))];
      const creds = new Map<string, any>();
      for (const id of divIds) {
        const { data: c } = await supabase.rpc("get_division_practice_credentials", { _division_id: id });
        (Array.isArray(c) ? c : []).forEach((x: any) => creds.set(x.id, x));
      }
      return rows.map((r) => ({ ...r, ...(creds.get(r.id) ?? {}) }));
    },
  });

  const relevant = (sessions ?? []).filter((s) => endMs(s) + HOUR > now);
  if (relevant.length === 0) return null;
  const first = relevant[0];
  if (new Date(first.starts_at).getTime() - now > 12 * HOUR) return null;
  const day = cphDay(new Date(first.starts_at).getTime());
  const daySessions = relevant.filter((s) => cphDay(new Date(s.starts_at).getTime()) === day);
  const nextId = daySessions.find((s) => endMs(s) > now)?.id;
  const div = first.divisions;

  return (
    <section className="relative overflow-hidden rounded-xl border border-primary/30 bg-card p-4">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Træningsdag
        </p>
        <h2 className="mt-1.5 text-lg font-black tracking-tight">
          {div?.leagues?.name ? `${div.leagues.name} — ` : ""}{div?.name ?? "Practice"}
        </h2>
        {div?.track && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {div.track}{div.layout ? ` · ${div.layout}` : ""}
          </p>
        )}
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {daySessions.map((s) => {
            const done = endMs(s) <= now;
            const isNext = s.id === nextId;
            return (
              <li
                key={s.id}
                className={`space-y-1.5 rounded-lg border p-3 text-xs ${isNext ? "border-primary bg-primary/5" : "border-border/70 bg-background/40"} ${done ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-base font-bold text-primary">
                    {new Date(s.starts_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" })}
                  </span>
                  {done ? <Badge variant="outline">Slut</Badge> : <Countdown target={new Date(s.starts_at).getTime()} />}
                </div>
                <p className="font-medium">{s.server_name || "Practice server"}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px]">P: {s.practice_minutes ?? "—"}m</Badge>
                  {s.has_qualifying && <Badge variant="outline" className="text-[10px]">Q: {s.qualifying_minutes ?? "—"}m</Badge>}
                  {s.has_race && <Badge variant="outline" className="text-[10px]">R: {s.race_minutes ?? "—"}m</Badge>}
                </div>
                {(s.lobby_code || s.lobby_password) && !done && (
                  <div className="space-y-0.5 rounded border border-border/60 bg-muted/40 p-1.5 font-mono text-[11px]">
                    <p className="flex items-center gap-1 text-muted-foreground"><KeyRound className="h-3 w-3" /> Lobby</p>
                    {s.lobby_code && <p>Code: {s.lobby_code}</p>}
                    {s.lobby_password && <p>Password: {s.lobby_password}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {div?.league_id && (
          <Link to="/ligaer/$leagueId" params={{ leagueId: div.league_id }} className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">
            Se liga →
          </Link>
        )}
      </div>
    </section>
  );
}
