import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TeamLeagueSignupDialog } from "./TeamLeagueSignupDialog";

export function LeagueTeamSignupEntry({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();

  const { data: ownedTeams } = useQuery({
    queryKey: ["my-owned-teams", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name")
        .eq("owner_id", user!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["league-team-entries-mine", leagueId, (ownedTeams ?? []).map((t) => t.id).join(",")],
    enabled: !!ownedTeams && ownedTeams.length > 0,
    queryFn: async () => {
      const ids = ownedTeams!.map((t) => t.id);
      const { data, error } = await (supabase as any)
        .from("league_team_entries")
        .select("team_id, car_class, status")
        .eq("league_id", leagueId)
        .in("team_id", ids)
        .neq("status", "withdrawn");
      if (error) throw error;
      return (data ?? []) as Array<{ team_id: string; car_class: string; status: string }>;
    },
  });

  if (!user || !ownedTeams || ownedTeams.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {ownedTeams.map((t) => (
          <TeamLeagueSignupDialog
            key={t.id}
            teamId={t.id}
            initialLeagueId={leagueId}
            />
          ))}
        </div>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Tilmeld team i denne liga
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Som team-ejer kan du tilmelde dit team og vælge lineup. De valgte kørere får en Discord-DM og skal selv acceptere.
          </p>
          <ul className="space-y-2">
            {ownedTeams.map((t) => {
              const teamEntries = (entries ?? []).filter((e) => e.team_id === t.id);
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    {teamEntries.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Tilmeldt: {teamEntries.map((e) => `${e.car_class} (${e.status === "confirmed" ? "bekræftet" : "afventer"})`).join(", ")}
                      </p>
                    )}
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/teams/$teamId" params={{ teamId: t.id }}>
                      Administrér tilmelding <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
