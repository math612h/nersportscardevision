import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flag, Calendar, ArrowUpRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Le Mans Ultimate</p>
        <h1 className="text-2xl font-bold tracking-tight">Ligaer & løb</h1>
        <p className="text-sm text-muted-foreground">Vælg en liga for at se afdelinger, regler og tilmelde dig.</p>
      </header>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-card/50" />
          ))}
        </div>
      )}

      {!isLoading && leagues?.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ingen ligaer endnu. En administrator skal oprette en liga først.
        </div>
      )}

      {regular.length > 0 && (
        <Section title="Ligaer" icon={<Flag className="h-4 w-4" />}>
          <CardGrid>
            {regular.map((l: any) => <LeagueCard key={l.id} l={l} />)}
          </CardGrid>
        </Section>
      )}

      {offseason.length > 0 && (
        <Section
          title="Off-Season events"
          icon={<Sparkles className="h-4 w-4" />}
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
    <section className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary">
          {icon}
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">{title}</h2>
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
  const count = l.divisions?.[0]?.count ?? 0;
  const countLabel = offseason ? (count === 1 ? "løb" : "løb") : (count === 1 ? "afdeling" : "afdelinger");
  const Icon = offseason ? Sparkles : Flag;

  return (
    <Link
      to="/ligaer/$leagueId"
      params={{ leagueId: l.id }}
      className="group relative block h-full overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
    >
      {/* Decorative gradient header */}
      <div className="relative h-20 overflow-hidden">
        {l.banner_url ? (
          <img src={l.banner_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-transparent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition group-hover:bg-primary group-hover:text-primary-foreground">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4 pt-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="truncate text-base font-semibold tracking-tight">{l.name}</h3>
        </div>

        {l.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{l.description}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground/60">Ingen beskrivelse.</p>
        )}

        <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span><span className="font-semibold text-foreground">{count}</span> {countLabel}</span>
        </div>
      </div>
    </Link>
  );
}
