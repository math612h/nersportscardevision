import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calendar, BookOpen, ArrowLeft, MapPin } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/ligaer/$leagueId")({
  component: LeagueDetail,
});

function LeagueDetail() {
  const { leagueId } = useParams({ from: "/_authenticated/ligaer/$leagueId" });

  const { data: league } = useQuery({
    queryKey: ["league", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: divisions } = useQuery({
    queryKey: ["divisions", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("*, entries(count)")
        .eq("league_id", leagueId)
        .order("race_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Alle ligaer
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{league?.name}</h1>
        {league?.description && <p className="mt-1 text-muted-foreground">{league.description}</p>}
        <div className="mt-3">
          <Link to="/ligaer/$leagueId/regler" params={{ leagueId }}>
            <Button variant="outline" size="sm" className="gap-2"><BookOpen className="h-4 w-4" /> Se regelsæt</Button>
          </Link>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Afdelinger</h2>
        {divisions?.length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen afdelinger oprettet endnu.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {divisions?.map((d: any) => (
            <Link key={d.id} to="/ligaer/$leagueId/afdeling/$divisionId" params={{ leagueId, divisionId: d.id }}>
              <Card className="cursor-pointer transition hover:border-primary">
                <CardHeader>
                  <CardTitle className="text-base">{d.name}</CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-2">
                    {d.track && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{d.track}{d.layout ? ` · ${d.layout}` : ""}</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {d.car_class && <Badge>{d.car_class}</Badge>}
                  {d.driver_category && <Badge variant="secondary">{d.driver_category}</Badge>}
                  {d.race_date && (
                    <Badge variant="outline" className="gap-1">
                      <Calendar className="h-3 w-3" /> {format(new Date(d.race_date), "dd MMM yyyy HH:mm")}
                    </Badge>
                  )}
                  <Badge variant="outline">{d.entries?.[0]?.count ?? 0} tilmeldt</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
