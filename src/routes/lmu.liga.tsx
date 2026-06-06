import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Flag, ArrowUpRight, Sparkles, Trophy, Timer, MapPin, Users, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { msToLapStr } from "@/lib/lmu-parser";
import type { ClassConfig } from "@/lib/tracks";

const LMU_TITLE = "Le Mans Ultimate ligaer & løb — DanishEnduranceSeries.dk";
const LMU_DESC =
  "Oversigt over alle Le Mans Ultimate-ligaer og off-season events i DanishEnduranceSeries.dk. Tilmeld dig, se afdelinger, regler og stillinger.";
const LMU_URL = "https://danishenduranceseries.dk/lmu/liga";

export const Route = createFileRoute("/lmu/liga")({
  component: ParticipantDashboard,
  head: () => ({
    meta: [
      { title: LMU_TITLE },
      { name: "description", content: LMU_DESC },
      { property: "og:title", content: LMU_TITLE },
      { property: "og:description", content: LMU_DESC },
      { property: "og:url", content: LMU_URL },
    ],
    links: [{ rel: "canonical", href: LMU_URL }],
  }),
});

function ParticipantDashboard() {
  const { data: leagues, isLoading } = useQuery({
    queryKey: ["leagues"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*, divisions(settings)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const leagueIds = useMemo(() => (leagues ?? []).map((l: any) => l.id), [leagues]);

  const { data: entriesByLeague } = useQuery({
    queryKey: ["leagues-entries-counts", leagueIds.sort().join(",")],
    enabled: leagueIds.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("league_id,car_class,driver_category,waitlist,division_id")
        .in("league_id", leagueIds)
        .is("division_id", null);
      if (error) throw error;
      const m: Record<string, { car_class: string; driver_category: string; waitlist: boolean }[]> = {};
      for (const e of data ?? []) {
        if (!e.league_id) continue;
        (m[e.league_id] ??= []).push({ car_class: e.car_class, driver_category: e.driver_category, waitlist: !!e.waitlist });
      }
      return m;
    },
  });

  const bannerPaths = useMemo(
    () => (leagues ?? []).map((l: any) => l.banner_url).filter((p: string | null): p is string => !!p && !p.startsWith("http")),
    [leagues],
  );

  const { data: bannerMap } = useQuery({
    queryKey: ["league-banner-urls", bannerPaths.sort().join(",")],
    enabled: bannerPaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("league-banners").createSignedUrls(bannerPaths, 60 * 60 * 24 * 7);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => { if (d.path && d.signedUrl) m[d.path] = d.signedUrl; });
      return m;
    },
  });

  const resolveBanner = (l: any): string | null => {
    if (!l.banner_url) return null;
    if (l.banner_url.startsWith("http")) return l.banner_url;
    return bannerMap?.[l.banner_url] ?? null;
  };

  const now = Date.now();
  const classify = (l: any): "past" | "active" | "upcoming" => {
    const divs: any[] = Array.isArray(l.divisions) ? l.divisions : [];
    const hasDivs = divs.length > 0;
    const allCompleted = hasDivs && divs.every((d) => !!d?.settings?.completed);
    if (allCompleted) return "past";
    const opens = l.signup_opens_at ? new Date(l.signup_opens_at).getTime() : null;
    if (opens == null || opens > now) return "upcoming";
    return "active";
  };

  const upcoming = (leagues ?? []).filter((l: any) => classify(l) === "upcoming");
  const active = (leagues ?? []).filter((l: any) => classify(l) === "active");
  const past = (leagues ?? []).filter((l: any) => classify(l) === "past");

  return (
    <div className="space-y-10">
      <Link to="/lmu" className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> LMU hub
      </Link>

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Liga Hub</p>
        <h1 className="text-2xl font-bold tracking-tight">Ligaer & løb</h1>
        <p className="text-sm text-muted-foreground">Vælg en liga for at se afdelinger, regler og tilmelde dig.</p>
      </header>

      <LeaderboardTeaser />

      {isLoading && (
        <CardGrid>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-card/50" />
          ))}
        </CardGrid>
      )}

      {!isLoading && leagues?.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ingen ligaer endnu. En administrator skal oprette en liga først.
        </div>
      )}

      {active.length > 0 && (
        <Section title="Aktive ligaer" icon={<Flag className="h-4 w-4" />}>
          <CardGrid>
            {active.map((l: any) => <LeagueCard key={l.id} l={l} bannerUrl={resolveBanner(l)} entries={entriesByLeague?.[l.id] ?? []} offseason={!!l.is_offseason} />)}
          </CardGrid>
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section
          title="Kommende ligaer"
          icon={<Sparkles className="h-4 w-4" />}
          description="Tilmelding er endnu ikke åbnet."
        >
          <CardGrid>
            {upcoming.map((l: any) => <LeagueCard key={l.id} l={l} bannerUrl={resolveBanner(l)} entries={entriesByLeague?.[l.id] ?? []} offseason={!!l.is_offseason} upcoming />)}
          </CardGrid>
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Tidligere ligaer" icon={<Trophy className="h-4 w-4" />}>
          <CardGrid>
            {past.map((l: any) => <LeagueCard key={l.id} l={l} bannerUrl={resolveBanner(l)} entries={entriesByLeague?.[l.id] ?? []} offseason={!!l.is_offseason} past />)}
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
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:[grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      {children}
    </div>
  );

}

function LeaderboardTeaser() {
  type TeaserRow = { id: string; driver_name: string; track: string; layout: string | null; car_class: string; best_lap_ms: number };
  const { data: rows } = useQuery({
    queryKey: ["leaderboard-teaser"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard_times")
        .select("id,driver_name,track,layout,car_class,best_lap_ms")
        .order("best_lap_ms", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const best = (() => {
    const map = new Map<string, TeaserRow>();
    for (const r of rows ?? []) {
      const key = `${r.car_class}|${r.track}|${r.layout ?? ""}|${r.driver_name.toLowerCase()}`;
      const cur = map.get(key);
      if (!cur || r.best_lap_ms < cur.best_lap_ms) map.set(key, r);
    }
    return Array.from(map.values()).sort((a, b) => a.best_lap_ms - b.best_lap_ms).slice(0, 5);
  })();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Leaderboard</h2>
        </div>
        <Link to="/leaderboard" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Se alle tider <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <Link
        to="/leaderboard"
        className="block overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
      >
        {best.length === 0 ? (
          <div className="px-4 py-5 text-center text-sm text-muted-foreground">
            Ingen tider endnu — upload en race-fil for at komme på leaderboardet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {best.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
                <span className="flex-1 truncate font-medium">{r.driver_name}</span>
                <Badge variant="secondary" className="hidden sm:inline-flex text-[10px]">{r.car_class}</Badge>
                <span className="hidden md:inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{r.track}{r.layout ? ` · ${r.layout}` : ""}</span>
                <span className="inline-flex items-center gap-1 font-mono tabular-nums text-sm"><Timer className="h-3 w-3 text-primary" />{msToLapStr(r.best_lap_ms)}</span>
              </li>
            ))}
          </ul>
        )}
      </Link>
    </section>
  );
}

function LeagueCard({
  l,
  bannerUrl,
  entries,
  offseason,
  upcoming,
  past,
}: {
  l: any;
  bannerUrl: string | null;
  entries: { car_class: string; driver_category: string; waitlist: boolean }[];
  offseason?: boolean;
  upcoming?: boolean;
  past?: boolean;
}) {
  const Icon = offseason ? Sparkles : Flag;
  const cfgs: ClassConfig[] = Array.isArray(l.class_configs) ? l.class_configs : [];

  let totalSlots = 0;
  let takenSlots = 0;
  let hasCap = false;
  for (const c of cfgs) {
    if (typeof c.max_drivers === "number" && c.max_drivers > 0) {
      hasCap = true;
      totalSlots += c.max_drivers;
      const taken = entries.filter((e) => !e.waitlist && e.car_class === c.car_class && e.driver_category === c.driver_category).length;
      takenSlots += Math.min(taken, c.max_drivers);
    }
  }
  const freeSlots = Math.max(0, totalSlots - takenSlots);

  return (
    <Link
      to="/ligaer/$leagueId"
      params={{ leagueId: l.id }}
      aria-label={`Åbn ${l.name}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt={`Banner for ${l.name}`}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-transparent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition group-hover:bg-primary group-hover:text-primary-foreground">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 pb-4 pt-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold tracking-tight">{l.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {hasCap ? (
              <span>
                <span className="font-semibold text-foreground">{freeSlots}</span> ledige slots på gridden
              </span>
            ) : (
              <span>Ingen pladsbegrænsning</span>
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}
