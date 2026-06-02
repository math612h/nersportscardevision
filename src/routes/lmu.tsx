import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flag, Calendar, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/lmu")({
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

  const regular = (leagues ?? []).filter((l: any) => !l.is_offseason);
  const offseason = (leagues ?? []).filter((l: any) => l.is_offseason);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Le Mans Ultimate</h1>
        <p className="text-sm text-muted-foreground">Vælg en liga for at se afdelinger, regler og tilmelde dig.</p>
      </header>

      {isLoading && <p className="text-muted-foreground">Indlæser ligaer…</p>}
      {!isLoading && leagues?.length === 0 && (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">
          Ingen ligaer endnu. En administrator skal oprette en liga først.
        </CardContent></Card>
      )}

      {regular.length > 0 && (
        <Section title="Ligaer" icon={<Flag className="h-5 w-5 text-primary" />}>
          <CardGrid>
            {regular.map((l: any) => <LeagueCard key={l.id} l={l} />)}
          </CardGrid>
        </Section>
      )}

      {offseason.length > 0 && (
        <Section
          title="Off-Season events"
          icon={<Sparkles className="h-5 w-5 text-primary" />}
          description="Enkeltløb uden for de faste ligaer."
        >
          <CardGrid>
            {offseason.map((l: any) => <LeagueCard key={l.id} l={l} offseason />)}
          </CardGrid>
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, description, children }: { title: string; icon: React.ReactNode; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function LeagueCard({ l, offseason }: { l: any; offseason?: boolean }) {
  return (
    <Link to="/ligaer/$leagueId" params={{ leagueId: l.id }} className="block h-full">
      <Card className="group flex h-full flex-col cursor-pointer transition hover:border-primary hover:shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {offseason ? <Sparkles className="h-5 w-5 shrink-0 text-primary" /> : <Flag className="h-5 w-5 shrink-0 text-primary" />}
              <CardTitle className="text-base truncate">{l.name}</CardTitle>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
          </div>
          {l.description && (
            <CardDescription className="line-clamp-2 min-h-[2.5rem]">{l.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="mt-auto pt-0">
          <Badge variant="secondary" className="gap-1">
            <Calendar className="h-3 w-3" />
            {l.divisions?.[0]?.count ?? 0} {offseason ? "løb" : "afdelinger"}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}
