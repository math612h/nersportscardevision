import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Flag, ArrowUpRight, Sparkles, Trophy, Timer, MapPin, Users, ArrowUp, ArrowDown, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { reorderLeaguesSwap } from "@/lib/league-order";
import { Badge } from "@/components/ui/badge";
import { msToLapStr } from "@/lib/lmu-parser";
import { classColor } from "@/lib/lmu-cars";
import { GuestBlur } from "@/components/GuestGate";

import { cn } from "@/lib/utils";
import type { ClassConfig } from "@/lib/tracks";

const LMU_TITLE = "Le Mans Ultimate ligaer & løb — LMU Danmark";
const LMU_DESC =
  "Oversigt over alle Le Mans Ultimate-ligaer og off-season events i LMU Danmark. Tilmeld dig, se afdelinger, regler og stillinger.";
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
  const { isAdmin } = useAuth();
  const qc = useQueryClient();


  const { data: leagues, isLoading } = useQuery({
    queryKey: ["leagues"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*, divisions(settings)")
        .eq("published", true)
        .order("sort_order", { ascending: true })
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

  const reorder = useMutation({
    mutationFn: async ({ list, id, dir }: { list: any[]; id: string; dir: "up" | "down" }) => {
      await reorderLeaguesSwap(list, id, dir);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leagues"] });
      qc.invalidateQueries({ queryKey: ["leagues-admin"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const makeMoveHandler = (list: any[]) => (id: string, dir: "up" | "down") =>
    reorder.mutate({ list, id, dir });


  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Ligaer</p>
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

      {!isLoading && leagues && leagues.length > 0 && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("active")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
                tab === "active" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Flag className="h-3.5 w-3.5" /> Aktive
            </button>
            <button
              type="button"
              onClick={() => setTab("upcoming")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
                tab === "upcoming" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> Kommende
            </button>
            <button
              type="button"
              onClick={() => setTab("past")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
                tab === "past" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Trophy className="h-3.5 w-3.5" /> Tidligere
            </button>
          </div>

          {tab === "active" && active.length > 0 && (
            <CardGrid>
              {active.map((l: any, i: number) => <LeagueCard key={l.id} l={l} bannerUrl={resolveBanner(l)} entries={entriesByLeague?.[l.id] ?? []} offseason={!!l.is_offseason} isAdmin={isAdmin} canMoveUp={i > 0} canMoveDown={i < active.length - 1} onMove={(dir) => makeMoveHandler(active)(l.id, dir)} reordering={reorder.isPending} />)}
            </CardGrid>
          )}
          {tab === "active" && active.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Ingen aktive ligaer i øjeblikket.
            </div>
          )}

          {tab === "upcoming" && upcoming.length > 0 && (
            <CardGrid>
              {upcoming.map((l: any, i: number) => <LeagueCard key={l.id} l={l} bannerUrl={resolveBanner(l)} entries={entriesByLeague?.[l.id] ?? []} offseason={!!l.is_offseason} upcoming isAdmin={isAdmin} canMoveUp={i > 0} canMoveDown={i < upcoming.length - 1} onMove={(dir) => makeMoveHandler(upcoming)(l.id, dir)} reordering={reorder.isPending} />)}
            </CardGrid>
          )}
          {tab === "upcoming" && upcoming.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Ingen kommende ligaer i øjeblikket.
            </div>
          )}

          {tab === "past" && past.length > 0 && (
            <CardGrid>
              {past.map((l: any, i: number) => <LeagueCard key={l.id} l={l} bannerUrl={resolveBanner(l)} entries={entriesByLeague?.[l.id] ?? []} offseason={!!l.is_offseason} past isAdmin={isAdmin} canMoveUp={i > 0} canMoveDown={i < past.length - 1} onMove={(dir) => makeMoveHandler(past)(l.id, dir)} reordering={reorder.isPending} />)}
            </CardGrid>
          )}
          {tab === "past" && past.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Ingen tidligere ligaer endnu.
            </div>
          )}
        </div>
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
  const { user } = useAuth();
  type TeaserRow = { id: string; driver_name: string; track: string; layout: string | null; car_class: string; best_lap_ms: number };
  const { data: rows } = useQuery({
    queryKey: ["leaderboard-teaser"],
    enabled: !!user,
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

  // Placeholder rows used to make the blur preview show structure for guests.
  const previewRows: TeaserRow[] = user
    ? best
    : Array.from({ length: 5 }).map((_, i) => ({
        id: `guest-${i}`,
        driver_name: "—————————",
        track: "—————",
        layout: null,
        car_class: "LMGT3",
        best_lap_ms: 90000 + i * 250,
      }));

  const listMarkup = (
    <ul className="divide-y divide-border">
      {previewRows.map((r, i) => (
        <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
          <span className="flex-1 truncate font-medium">{r.driver_name}</span>
          <Badge variant="outline" className={`hidden sm:inline-flex text-[10px] ${classColor(r.car_class).badge}`}>{r.car_class}</Badge>
          <span className="hidden md:inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{r.track}{r.layout ? ` · ${r.layout}` : ""}</span>
          <span className="inline-flex items-center gap-1 font-mono tabular-nums text-sm"><Timer className="h-3 w-3 text-primary" />{msToLapStr(r.best_lap_ms)}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Leaderboard</h2>
        </div>
        {user && (
          <Link to="/leaderboard" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Se alle tider <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {user ? (
        <Link
          to="/leaderboard"
          className="block overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
        >
          {best.length === 0 ? (
            <div className="px-4 py-5 text-center text-sm text-muted-foreground">
              Ingen tider endnu — upload en race-fil for at komme på leaderboardet.
            </div>
          ) : (
            listMarkup
          )}
        </Link>
      ) : (
        <GuestBlur active label="Log ind for at se tider">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {listMarkup}
          </div>
        </GuestBlur>
      )}
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
  isAdmin,
  canMoveUp,
  canMoveDown,
  onMove,
  reordering,
}: {
  l: any;
  bannerUrl: string | null;
  entries: { car_class: string; driver_category: string; waitlist: boolean }[];
  offseason?: boolean;
  upcoming?: boolean;
  past?: boolean;
  isAdmin?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (dir: "up" | "down") => void;
  reordering?: boolean;
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
    <div className="relative">
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
          {upcoming && (
            <Badge className="absolute left-3 top-3 gap-1 bg-background/80 text-foreground backdrop-blur">
              <CardCountdown opensAt={l.signup_opens_at ?? null} />
            </Badge>
          )}
          {past && (
            <Badge variant="secondary" className="absolute left-3 top-3">Afsluttet</Badge>
          )}
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
      {isAdmin && onMove && (
        <div className="absolute right-2 bottom-2 z-10 flex gap-1 rounded-md bg-background/85 p-1 backdrop-blur border border-border shadow-sm">
          <button
            type="button"
            aria-label="Flyt op"
            title="Flyt op"
            disabled={!canMoveUp || reordering}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMove("up"); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Flyt ned"
            title="Flyt ned"
            disabled={!canMoveDown || reordering}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMove("down"); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CardCountdown({ opensAt }: { opensAt: string | null }) {
  const target = opensAt ? new Date(opensAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  if (!opensAt || target == null || Number.isNaN(target)) {
    return <><Timer className="h-3 w-3" /> Tilmelding lukket</>;
  }
  const diff = target - now;
  if (diff <= 0) return <><Timer className="h-3 w-3" /> Åbnet</>;
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const label = d > 0 ? `${d}d ${h}t ${m}m` : h > 0 ? `${h}t ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
  return <><Timer className="h-3 w-3" /> Åbner om {label}</>;
}
