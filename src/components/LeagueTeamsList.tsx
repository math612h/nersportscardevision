import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type TeamEntry = {
  id: string;
  team_id: string;
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
        .select("id, team_id, status, teams:team_id(id, name, logo_url)")
        .eq("league_id", leagueId)
        .eq("status", "confirmed");
      if (error) throw error;
      return (data ?? []) as TeamEntry[];
    },
  });

  const teams = useMemo(
    () => (entries ?? []).filter((e) => e.teams).map((e) => e.teams!),
    [entries],
  );

  const { data: logoMap } = useQuery({
    queryKey: ["league-team-logos", teams.map((t) => t.logo_url).filter(Boolean).join(",")],
    enabled: teams.some((t) => t.logo_url),
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        teams.filter((t) => t.logo_url).map(async (t) => {
          const u = await signedLogo(t.logo_url!);
          if (u) map[t.id] = u;
        }),
      );
      return map;
    },
  });

  if (teams.length === 0) return null;

  return (
    <section id="teams" className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Shield className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Teams i ligaen</h2>
      </div>
      <ul className="flex flex-wrap gap-2">
        {teams.map((t) => {
          const initials = t.name.slice(0, 2).toUpperCase();
          const logo = logoMap?.[t.id];
          return (
            <li key={t.id}>
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
    </section>
  );
}
