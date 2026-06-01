import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flag, Calendar, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/")({
  component: ParticipantDashboard,
});

function ParticipantDashboard() {
  const { data: leagues, isLoading } = useQuery({
    queryKey: ["leagues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*, divisions(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ligaer</h1>
        <p className="text-sm text-muted-foreground">Vælg en liga for at se afdelinger, regler og tilmelde dig.</p>
      </div>

      {isLoading && <p className="text-muted-foreground">Indlæser ligaer…</p>}
      {!isLoading && leagues?.length === 0 && (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">
          Ingen ligaer endnu. En administrator skal oprette en liga først.
        </CardContent></Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {leagues?.map((l: any) => (
          <Link key={l.id} to="/ligaer/$leagueId" params={{ leagueId: l.id }}>
            <Card className="group cursor-pointer transition hover:border-primary">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Flag className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{l.name}</CardTitle>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" />
                </div>
                {l.description && <CardDescription className="line-clamp-2">{l.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <Badge variant="secondary" className="gap-1">
                  <Calendar className="h-3 w-3" />
                  {l.divisions?.[0]?.count ?? 0} afdelinger
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
