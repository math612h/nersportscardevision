import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { classColor } from "@/lib/lmu-cars";

type TeamEntry = {
  id: string;
  team_id: string;
  car_class: string;
  status: string;
  teams: { id: string; name: string; logo_url: string | null } | null;
};

async function signedLogo(path: string) {
  const { data } = await supabase.storage.from("team-logos").createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

export function LeagueTeamsList({ leagueId }: { leagueId: string }) {
  const { data: entries } = useQuery({
    queryKey: ["league-team-entries", leagueId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("league_team_entries")
        .select("id, team_id, car_class, status, teams:team_id(id, name, logo_url)")
        .eq("league_id", leagueId)
        .eq("status", "confirmed");
      if (error) throw error;
      return (data ?? []) as TeamEntry[];
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, TeamEntry[]>();
    for (const e of entries ?? []) {
      if (!e.teams) continue;
      const arr = m.get(e.car_class) ?? [];
      arr.push(e);
      m.set(e.car_class, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const allTeams = useMemo(
    () => (entries ?? []).filter((e) => e.teams).map((e) => e.teams!),
    [entries],
  );

  const { data: logoMap } = useQuery({
    queryKey: ["league-team-logos", allTeams.map((t) => t.logo_url).filter(Boolean).join(",")],
    enabled: allTeams.some((t) => t.logo_url),
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        allTeams.filter((t) => t.logo_url).map(async (t) => {
          const u = await signedLogo(t.logo_url!);
          if (u) map[t.id] = u;
        }),
      );
      return map;
    },
  });

  if (grouped.length === 0) return null;

  return (
    <section id="teams" className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Shield className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Teams i ligaen</h2>
      </div>
      <div className="space-y-3">
        {grouped.map(([cls, list]) => {
          const col = classColor(cls);
          return (
            <Card key={cls} className={`border-l-4 ${col.border}`}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                  <span className={col.text}>{cls}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {list.length} team{list.length === 1 ? "" : "s"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="flex flex-wrap gap-2">
                  {list.map((e) => {
                    const t = e.teams!;
                    const initials = t.name.slice(0, 2).toUpperCase();
                    const logo = logoMap?.[t.id];
                    return (
                      <li key={e.id}>
                        <Link
                          to="/teams/$teamId"
                          params={{ teamId: t.id }}
                          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium transition hover:border-primary hover:bg-accent"
                        >
                          <Avatar className="h-6 w-6">
                            {logo ? <AvatarImage src={logo} alt="" /> : null}
                            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                          </Avatar>
                          <span className="truncate">{t.name}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
