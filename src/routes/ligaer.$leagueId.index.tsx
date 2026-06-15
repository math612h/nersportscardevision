import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Calendar, BookOpen, ArrowLeft, MapPin, UserPlus, UserMinus, Users, Trophy, ArrowUpRight, Zap, CheckCircle2, Settings as SettingsIcon, Timer } from "lucide-react";
import { useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendTransactionalEmail } from "@/lib/email/send";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { leaveLeague } from "@/lib/leagues.functions";
import { assignDiscordRoleForEntry, removeDiscordRoleForEntry } from "@/lib/discord.functions";
import { checkDiscordGuildMembership } from "@/lib/discord-guild.functions";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RatingBadge } from "@/components/RatingBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { WEATHER_BY_KEY, type WeatherKey, type ClassConfig, type EventSettings, EVENT_AID_FIELDS, getTrackImageFile } from "@/lib/tracks";
import { CARS_BY_CLASS, classColor } from "@/lib/lmu-cars";
import { Checkbox } from "@/components/ui/checkbox";
import { acknowledgeLeagueRules } from "@/lib/league-rules.functions";
import { GuestBlur } from "@/components/GuestGate";

export const Route = createFileRoute("/ligaer/$leagueId/")({
  component: LeagueDetail,
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("leagues")
      .select("name, description, is_offseason")
      .eq("id", params.leagueId)
      .maybeSingle();
    return {
      leagueName: (data?.name as string | undefined) ?? null,
      leagueDesc: (data?.description as string | undefined) ?? null,
      isOffseason: !!(data as any)?.is_offseason,
    };
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.leagueName ?? "Liga";
    const kind = loaderData?.isOffseason ? "Off-season event" : "Liga";
    const title = `${name} — ${kind} | LMU Danmark`;
    const desc =
      loaderData?.leagueDesc?.slice(0, 155) ??
      `${name}: afdelinger, tilmeldte kørere, regelsæt og stillinger i LMU Danmark.`;
    const url = `https://danishenduranceseries.dk/ligaer/${params.leagueId}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

function useCountdown(target: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  if (target == null) return null;
  const diff = target - now;
  if (diff <= 0) return { diff: 0, d: 0, h: 0, m: 0, s: 0 };
  const s = Math.floor(diff / 1000);
  return { diff, d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

function SignupOpensBanner({ opensAt }: { opensAt: string | null }) {
  const target = opensAt ? new Date(opensAt).getTime() : null;
  const c = useCountdown(target);
  if (!opensAt) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Tilmelding er endnu ikke åbnet. En administrator fastsætter en åbningstid.
      </div>
    );
  }
  if (!target || Number.isNaN(target)) return null;
  if (!c || c.diff <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
      <Timer className="h-4 w-4 text-primary" />
      <span className="font-medium">Tilmelding åbner om</span>
      <span className="font-mono tabular-nums font-semibold text-primary">
        {c.d}d {String(c.h).padStart(2, "0")}t {String(c.m).padStart(2, "0")}m {String(c.s).padStart(2, "0")}s
      </span>
      <span className="text-xs text-muted-foreground">({format(new Date(opensAt), "dd MMM yyyy HH:mm")})</span>
    </div>
  );
}

function RaceCountdown({ raceDate }: { raceDate: string }) {
  const target = new Date(raceDate).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (Number.isNaN(target)) return null;
  const diff = target - now;
  if (diff <= 0) {
    return (
      <Badge className="gap-1 bg-primary text-primary-foreground animate-pulse">
        <Timer className="h-3 w-3" /> LIVE
      </Badge>
    );
  }
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const label =
    d > 0 ? `${d}d ${h}t ${m}m`
    : h > 0 ? `${h}t ${m}m ${String(sec).padStart(2, "0")}s`
    : `${m}m ${String(sec).padStart(2, "0")}s`;
  const soon = diff < 60 * 60 * 1000;
  return (
    <Badge variant={soon ? "default" : "outline"} className={`gap-1 ${soon ? "bg-primary text-primary-foreground" : ""}`}>
      <Timer className="h-3 w-3" /> {label}
    </Badge>
  );
}

function LeagueDetail() {
  const { leagueId } = useParams({ from: "/ligaer/$leagueId/" });
  const { user } = useAuth();
  const isGuest = !user;


  const { data: league } = useQuery({
    queryKey: ["league", leagueId],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: divisions } = useQuery({
    queryKey: ["divisions", leagueId],
    staleTime: 0,
    refetchOnMount: "always",
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

  const { data: leagueSignupCount } = useQuery({
    queryKey: ["league-signup-count", leagueId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("league_id", leagueId)
        .eq("waitlist", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile-approved", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("approved").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data as { approved: boolean | null } | null;
    },
  });
  const isApproved = !!myProfile?.approved;

  const divisionIds = useMemo(() => (divisions ?? []).map((d: any) => d.id), [divisions]);
  const { data: lobbies } = useQuery({
    queryKey: ["divisions-lobbies", leagueId, divisionIds.join(",")],
    enabled: !!user && isApproved && divisionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("division_lobbies")
        .select("division_id,lobby_code,lobby_password,server_name")
        .in("division_id", divisionIds);
      if (error) throw error;
      const m: Record<string, { lobby_code: string | null; lobby_password: string | null; server_name: string | null }> = {};
      (data ?? []).forEach((l: any) => { m[l.division_id] = l; });
      return m;
    },
  });

  const configs: ClassConfig[] = Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];

  const trackFiles = useMemo(() => {
    const set = new Set<string>();
    (divisions ?? []).forEach((d: any) => { const f = getTrackImageFile(d.track); if (f) set.add(f); });
    return Array.from(set);
  }, [divisions]);

  const { data: imageMap } = useQuery({
    queryKey: ["track-image-urls", trackFiles.sort().join(",")],
    enabled: trackFiles.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("track-images").createSignedUrls(trackFiles, 60 * 60 * 24 * 7);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => { if (d.path && d.signedUrl) m[d.path] = d.signedUrl; });
      return m;
    },
  });

  return (
    <div className="space-y-8">
      <Link to="/lmu/liga" className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Alle ligaer
      </Link>

      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {(league as any)?.is_offseason ? "Off-Season event" : "Liga"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{league?.name}</h1>
          {league?.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{league.description}</p>}
        </div>

        <div className="flex flex-col items-start gap-2">
          {configs.length > 0
            ? configs.map((c, i) => {
                const col = classColor(c.car_class);
                return (
                  <Badge key={i} variant="outline" className={`gap-1.5 ${col.badge}`}>
                    <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                    {c.car_class} {c.driver_category} · #{c.number_from}-{c.number_to}
                  </Badge>
                );
              })
            : (<>
                {(league as any)?.car_class && <Badge>{(league as any).car_class}</Badge>}
                {(league as any)?.driver_category && <Badge variant="secondary">{(league as any).driver_category}</Badge>}
              </>)}
        </div>

        <SignupOpensBanner opensAt={(league as any)?.signup_opens_at ?? null} />

        <GuestBlur active={isGuest} label="Log ind for at tilmelde">
          <div className="space-y-2 pt-1">
            {league && <SignupDialog leagueId={leagueId} configs={configs} signupOpensAt={(league as any)?.signup_opens_at ?? null} approvedOnly={!!(league as any)?.approved_only} />}
            <div className="flex flex-wrap gap-2">
              <RulesButton leagueId={leagueId} />
              {league && <EditEntryDialog leagueId={leagueId} />}
              {league && <LeaveLeagueButton leagueId={leagueId} />}
            </div>
          </div>
        </GuestBlur>


      </header>

      <QuickNav />

      <GuestBlur active={isGuest} label="Log ind for at se entrylisten">
        {league && <SignupsList leagueId={leagueId} configs={configs} />}
      </GuestBlur>

      <DriverAidsView settings={((league as any)?.event_settings ?? {}) as EventSettings} />




      <section id="kalender" className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Calendar className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Afdelinger</h2>
        </div>
        {divisions?.length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen afdelinger oprettet endnu.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {divisions?.map((d: any) => {
            const slots: WeatherKey[] = Array.isArray(d.settings?.weather) ? d.settings.weather : [];
            const completed = !!d.settings?.completed;
            const imgFile = getTrackImageFile(d.track);
            const imgUrl = imgFile ? imageMap?.[imgFile] : null;
            const startedAt = d.race_date ? new Date(d.race_date).getTime() : 0;
            const isActive = !completed && startedAt > 0 && Date.now() >= startedAt && Date.now() - startedAt < 4 * 60 * 60 * 1000;
            const lobby = lobbies?.[d.id];
            const hasLobby = !!(lobby?.server_name || lobby?.lobby_code || lobby?.lobby_password);
            const cardInner = (
              <Card className={`flex h-full flex-col overflow-hidden transition hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)] ${isActive ? "border-2 border-green-500 shadow-[0_0_0_1px_rgb(34_197_94_/_0.6),0_0_24px_-4px_rgb(34_197_94_/_0.5)] hover:border-green-400" : "border-border hover:border-primary"}`}>
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                  {imgUrl ? (
                    <img src={imgUrl} alt={d.track ?? d.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-transparent" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
                  {!isGuest && (
                    <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </div>
                  )}
                  {completed && (
                    <Badge variant="secondary" className="absolute left-3 top-3 text-[10px]">Afsluttet</Badge>
                  )}
                  {isActive && (
                    <Badge className="absolute left-3 top-3 gap-1 bg-green-500 text-white text-[10px] hover:bg-green-500">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
                    </Badge>
                  )}
                </div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{d.name}</CardTitle>
                  {d.track && (
                    <CardDescription className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{d.track}{d.layout ? ` · ${d.layout}` : ""}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="mt-auto space-y-2 pt-0">
                  <div className="flex flex-wrap gap-2">
                    {d.race_date && (
                      <Badge variant="outline" className="gap-1">
                        <Calendar className="h-3 w-3" /> {format(new Date(d.race_date), "dd MMM yyyy HH:mm")}
                      </Badge>
                    )}
                    {(d.settings as any)?.event_settings?.race_minutes != null && (
                      <Badge variant="outline" className="gap-1">
                        <Timer className="h-3 w-3" /> {(d.settings as any).event_settings.race_minutes} min
                      </Badge>
                    )}
                    {d.race_date && !completed && <RaceCountdown raceDate={d.race_date} />}
                    <Badge variant="outline">{leagueSignupCount ?? d.entries?.[0]?.count ?? 0} tilmeldt</Badge>
                  </div>
                  {slots.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {slots.map((key, i) => {
                        const w = WEATHER_BY_KEY[key];
                        if (!w) return null;
                        const Icon = w.icon;
                        return <Icon key={i} className="h-4 w-4 text-muted-foreground" aria-label={w.label} />;
                      })}
                    </div>
                  )}
                  {hasLobby && !completed && (
                    <ul className="mt-1 space-y-0.5 rounded border border-border/60 bg-muted/30 p-2 text-xs">
                      {lobby?.server_name && (
                        <li className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Server Navn</span>
                          <span className="font-mono font-medium truncate">{lobby.server_name}</span>
                        </li>
                      )}
                      {lobby?.lobby_code && (
                        <li className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Lobby Code</span>
                          <span className="font-mono font-medium truncate">{lobby.lobby_code}</span>
                        </li>
                      )}
                      {lobby?.lobby_password && (
                        <li className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Password</span>
                          <span className="font-mono font-medium truncate">{lobby.lobby_password}</span>
                        </li>
                      )}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
            if (isGuest) {
              return (
                <div key={d.id} className="group block h-full opacity-90" aria-disabled="true">
                  {cardInner}
                </div>
              );
            }
            return (
              <Link
                key={d.id}
                to="/ligaer/$leagueId/afdeling/$divisionId"
                params={{ leagueId, divisionId: d.id }}
                className="group block h-full"
              >
                {cardInner}
              </Link>
            );
          })}
        </div>
      </section>

      <GuestBlur active={isGuest} label="Log ind for at se resultater">
        <RaceDataResults leagueId={leagueId} />
      </GuestBlur>

      <GuestBlur active={isGuest} label="Log ind for at se stillinger">
        <Standings leagueId={leagueId} configs={configs} separateDivisionStandings={!!(league as any)?.separate_division_standings} />
      </GuestBlur>
    </div>
  );
}

function useLeagueSignups(leagueId: string) {
  return useQuery({
    queryKey: ["league-signups", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id,user_id,driver_name,car_class,driver_category,car_number,waitlist,created_at,team_id,car_model")
        .eq("league_id", leagueId)
        .is("division_id", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useTeamLookup(teamIds: string[]) {
  const key = Array.from(new Set(teamIds)).sort().join(",");
  return useQuery({
    queryKey: ["teams-by-id", key],
    enabled: teamIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("teams")
        .select("id,name")
        .in("id", Array.from(new Set(teamIds)));
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const t of (data ?? []) as { id: string; name: string }[]) map[t.id] = t.name;
      return map;
    },
  });
}

function useMyTeams(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-teams", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_members")
        .select("team_id, teams(id,name)")
        .eq("user_id", userId);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => r.teams).filter(Boolean) as { id: string; name: string }[];
    },
  });
}


function SignupsList({ leagueId, configs }: { leagueId: string; configs: ClassConfig[] }) {
  const { data } = useLeagueSignups(leagueId);

  const userIds = useMemo(() => Array.from(new Set((data ?? []).map((e) => e.user_id))), [data]);
  const teamIds = useMemo(() => (data ?? []).map((e: any) => e.team_id).filter(Boolean) as string[], [data]);
  const { data: teamMap } = useTeamLookup(teamIds);
  const { data: approvedMap } = useQuery({
    queryKey: ["signup-approvals", leagueId, userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data: profs, error } = await supabase
        .from("profiles")
        .select("id,approved")
        .in("id", userIds);
      if (error) throw error;
      return new Set((profs ?? []).filter((p) => p.approved).map((p) => p.id));
    },
  });
  const { data: ratingMap } = useQuery({
    queryKey: ["entry-ratings", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data: rs, error } = await (supabase as any)
        .from("user_ratings")
        .select("user_id,score,percentile")
        .in("user_id", userIds);
      if (error) throw error;
      const m: Record<string, { score: number; percentile: number | null }> = {};
      for (const r of (rs ?? []) as any[]) m[r.user_id] = {
        score: Number(r.score),
        percentile: r.percentile != null ? Number(r.percentile) : null,
      };
      return m;
    },
  });

  if (!data || data.length === 0) return null;

  const keys = configs.length
    ? configs.map((c) => `${c.car_class} · ${c.driver_category}`)
    : Array.from(new Set(data.map((e) => `${e.car_class} · ${e.driver_category}`)));

  const grouped: Record<string, typeof data> = {};
  for (const k of keys) grouped[k] = [];
  for (const e of data) {
    const k = `${e.car_class} · ${e.driver_category}`;
    (grouped[k] ??= [] as any).push(e);
  }

  return (
    <section id="entryliste" className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Users className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Entryliste</h2>
      </div>
      <div className="space-y-3">
        {Object.entries(grouped).map(([k, list]) => {
          if (!list || list.length === 0) return null;
          const [cls, cat] = k.split(" · ");
          const cfg = configs.find((c) => c.car_class === cls && c.driver_category === cat);
          return (
            <EntryClassCard
              key={k}
              cls={cls}
              cat={cat}
              cfg={cfg}
              list={list}
              teamMap={teamMap}
              ratingMap={ratingMap}
              approvedMap={approvedMap}
            />
          );
        })}

      </div>
    </section>
  );
}

function EntryClassCard({ cls, cat, cfg, list, teamMap, ratingMap, approvedMap }: {
  cls: string;
  cat: string;
  cfg: ClassConfig | undefined;
  list: Array<{ id: string; user_id: string; driver_name: string; car_class: string; driver_category: string; car_number: number | null; waitlist: boolean; created_at: string; team_id?: string | null; car_model?: string | null }>;
  teamMap?: Record<string, string>;
  ratingMap?: Record<string, { score: number; percentile: number | null }>;
  approvedMap?: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const grid = list.filter((e) => !e.waitlist).sort((a, b) => (a.car_number ?? 0) - (b.car_number ?? 0));
  const wait = list.filter((e) => e.waitlist).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const col = classColor(cls);
  const LIMIT = 5;
  const visibleGrid = expanded ? grid : grid.slice(0, LIMIT);
  const hiddenCount = grid.length - visibleGrid.length;

  return (
    <Card className={`border-l-4 ${col.border}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
          <span className={col.text}>{cls}</span>
          <Badge variant="outline" className="text-[10px]">{cat}</Badge>
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {grid.length}{cfg?.max_drivers ? `/${cfg.max_drivers}` : ""} på grid{wait.length > 0 ? ` · ${wait.length} på venteliste` : ""}
        </span>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <ul className="divide-y divide-border">
          {visibleGrid.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="inline-flex h-7 min-w-9 items-center justify-center rounded bg-muted px-2 font-mono text-xs font-semibold tabular-nums">
                #{e.car_number}
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate"><UserAvatar userId={e.user_id} name={e.driver_name} size="sm" /></div>
                {e.team_id && teamMap?.[e.team_id] && (
                  <div className="mt-0.5 sm:hidden">
                    <Badge variant="outline" className="text-[10px]" title="Team">
                      {teamMap[e.team_id]}
                    </Badge>
                  </div>
                )}
                {e.car_model && (
                  <div className="mt-0.5 inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/40 max-w-full truncate">
                    {e.car_model}
                  </div>
                )}
              </div>
              {e.team_id && teamMap?.[e.team_id] && (
                <Badge variant="outline" className="hidden sm:inline-flex text-[10px] shrink-0" title="Team">
                  {teamMap[e.team_id]}
                </Badge>
              )}
              {ratingMap?.[e.user_id] && (
                <RatingBadge
                  score={ratingMap[e.user_id].score}
                  percentile={ratingMap[e.user_id].percentile}
                  confidence={1}
                  size="xs"
                />
              )}
              {approvedMap?.has(e.user_id) && (
                <Badge variant="outline" className="gap-1 text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 shrink-0">
                  <CheckCircle2 className="h-3 w-3" />Godkendt
                </Badge>
              )}
            </li>
          ))}
        </ul>
        {grid.length > LIMIT && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Skjul" : `Se hele entryliste (${hiddenCount} mere)`}
          </Button>
        )}
        {wait.length > 0 && (
          <div className="rounded-md border border-dashed border-border p-2">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Venteliste</p>
            <ul className="divide-y divide-border">
              {wait.map((e, idx) => (
                <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {idx + 1}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">#{e.car_number}</span>
                  <span className="flex-1 truncate"><UserAvatar userId={e.user_id} name={e.driver_name} size="xs" /></span>
                  {ratingMap?.[e.user_id] && (
                    <RatingBadge
                      score={ratingMap[e.user_id].score}
                      percentile={ratingMap[e.user_id].percentile}
                      confidence={1}
                      size="xs"
                    />
                  )}
                  {approvedMap?.has(e.user_id) && (
                    <Badge variant="outline" className="gap-1 text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />Godkendt
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


type ResultRow = {
  car_number: number;
  driver_name: string;
  car_class: string;
  driver_category: string;
  class_position: number;
  points: number;
  fastest_lap?: boolean;
  penalty_seconds?: number;
  penalty_points?: number;
  dns?: boolean;
};

function Standings({ leagueId, configs, separateDivisionStandings }: { leagueId: string; configs: ClassConfig[]; separateDivisionStandings: boolean }) {
  const { data: divisions } = useQuery({
    queryKey: ["league-results", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id,name,settings,race_date")
        .eq("league_id", leagueId)
        .order("race_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: leagueEntries } = useQuery({
    queryKey: ["league-entries-with-teams", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("user_id,car_class,driver_category,car_number,team_id")
        .eq("league_id", leagueId);
      if (error) throw error;
      return (data ?? []) as { user_id: string; car_class: string; driver_category: string; car_number: number | null; team_id: string | null }[];
    },
  });
  const entryTeamMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const e of leagueEntries ?? []) {
      if (e.car_number != null) m[`${e.car_class}|${e.driver_category}|${e.car_number}`] = e.team_id;
    }
    return m;
  }, [leagueEntries]);
  const entryUserMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of leagueEntries ?? []) {
      if (e.car_number != null) m[`${e.car_class}|${e.driver_category}|${e.car_number}`] = e.user_id;
    }
    return m;
  }, [leagueEntries]);
  const teamIds = useMemo(() => Object.values(entryTeamMap).filter(Boolean) as string[], [entryTeamMap]);
  const { data: teamMap } = useTeamLookup(teamIds);

  const completed = (divisions ?? []).filter((d: any) => d.settings?.completed && Array.isArray(d.settings?.results));

  if (completed.length === 0) {
    return (
      <section id="stillinger" className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Stillinger</h2>
        </div>
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Stillinger vises når der er afholdt løb.
          </CardContent>
        </Card>
      </section>
    );
  }

  type Agg = {
    car_number: number;
    driver_name: string;
    car_class: string;
    driver_category: string;
    race: number;
    fl: number;
    total: number;
    penalty: number;
    pointPenalty: number;
    rounds: Record<string, { points: number; fl: boolean; flPts: number; penalty: number; pointPenalty: number; dns: boolean }>;
  };
  const map = new Map<string, Agg>();
  for (const d of completed as any[]) {
    const flPts = Number(d.settings?.fastest_lap_points ?? 0);
    for (const r of d.settings.results as ResultRow[]) {
      const key = `${r.car_class}|${r.driver_category}|${r.car_number}`;
      const cur = map.get(key) ?? {
        car_number: r.car_number,
        driver_name: r.driver_name,
        car_class: r.car_class,
        driver_category: r.driver_category,
        race: 0,
        fl: 0,
        total: 0,
        penalty: 0,
        pointPenalty: 0,
        rounds: {},
      };
      const earnedFl = r.fastest_lap ? flPts : 0;
      const pen = Number(r.penalty_seconds ?? 0);
      const ptsPen = Math.max(0, Number(r.penalty_points ?? 0));
      cur.race += r.points;
      cur.fl += earnedFl;
      cur.total += Math.max(0, r.points + earnedFl - ptsPen);
      cur.penalty += pen;
      cur.pointPenalty += ptsPen;
      cur.rounds[d.id] = { points: r.points, fl: !!r.fastest_lap, flPts: earnedFl, penalty: pen, pointPenalty: ptsPen, dns: !!r.dns };
      map.set(key, cur);
    }
  }

  const allRows = Array.from(map.values());
  const groupKeys = configs.length
    ? configs.map((c) => `${c.car_class} · ${c.driver_category}`)
    : Array.from(new Set(allRows.map((r) => `${r.car_class} · ${r.driver_category}`)));

  if (separateDivisionStandings) {
    return (
      <section id="stillinger" className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Stillinger pr. afdeling</h2>
        </div>
        {completed.map((d: any) => {
          const flPts = Number(d.settings?.fastest_lap_points ?? 0);
          const results = (d.settings.results as ResultRow[]) ?? [];
          const classKeys = groupKeys.filter((k) => {
            const [cls, cat] = k.split(" · ");
            return results.some((r) => r.car_class === cls && r.driver_category === cat);
          });
          if (classKeys.length === 0) return null;
          return (
            <div key={d.id} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>{d.name}</span>
                {d.race_date && <span className="text-xs font-normal text-muted-foreground">{format(new Date(d.race_date), "dd MMM yyyy")}</span>}
              </div>
              {classKeys.map((k) => {
                const [cls, cat] = k.split(" · ");
                const rows = results
                  .filter((r) => r.car_class === cls && r.driver_category === cat)
                  .map((r) => {
                    const earnedFl = r.fastest_lap ? flPts : 0;
                    const ptsPen = Math.max(0, Number(r.penalty_points ?? 0));
                    const pen = Number(r.penalty_seconds ?? 0);
                    return {
                      car_number: r.car_number,
                      driver_name: r.driver_name,
                      points: r.points,
                      fl: !!r.fastest_lap,
                      flPts: earnedFl,
                      penalty: pen,
                      pointPenalty: ptsPen,
                      dns: !!r.dns,
                      total: Math.max(0, r.points + earnedFl - ptsPen),
                    };
                  })
                  .sort((a, b) => b.total - a.total);
                if (rows.length === 0) return null;
                return (
                  <Card key={`${d.id}-${k}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <span>{cls}</span>
                        <Badge variant="outline" className="text-[10px]">{cat}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground">
                            <th className="py-1 pr-2 w-8">#</th>
                            <th className="py-1 pr-2">Kører</th>
                            <th className="py-1 pr-2">Team</th>
                            <th className="py-1 pr-2 w-12 text-center">Nr.</th>
                            <th className="py-1 px-1 w-10 text-center" title="Fastest lap points">FL</th>
                            <th className="py-1 px-1 w-12 text-center" title="Tidsstraf">Straf</th>
                            <th className="py-1 px-1 w-14 text-center" title="Pointstraf">Pt-straf</th>
                            <th className="py-1 pl-2 w-12 text-right">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const tId = entryTeamMap[`${cls}|${cat}|${r.car_number}`];
                            const teamName = tId ? (teamMap?.[tId] ?? "") : "";
                            return (
                              <tr key={r.car_number} className="border-t border-border">
                                <td className="py-1.5 pr-2 font-semibold tabular-nums">{r.dns ? "–" : i + 1}</td>
                                <td className="py-1.5 pr-2 truncate"><UserAvatar userId={entryUserMap[`${cls}|${cat}|${r.car_number}`] ?? null} name={r.driver_name} size="sm" /></td>
                                <td className="py-1.5 pr-2 truncate text-xs text-muted-foreground">{teamName || "–"}</td>
                                <td className="py-1.5 pr-2 text-center font-mono text-xs">{r.car_number}</td>
                                <td className="py-1.5 px-1 text-center tabular-nums text-muted-foreground">
                                  {r.fl ? <span className="inline-flex items-center gap-0.5">{r.flPts}<Zap className="h-3 w-3 text-primary" /></span> : "–"}
                                </td>
                                <td className="py-1.5 px-1 text-center tabular-nums text-destructive">{r.penalty > 0 ? `+${r.penalty}s` : "–"}</td>
                                <td className="py-1.5 px-1 text-center tabular-nums text-destructive">{r.pointPenalty > 0 ? `-${r.pointPenalty}` : "–"}</td>
                                <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{r.dns ? "DNS" : r.total}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        })}
      </section>
    );
  }


  return (
    <section id="stillinger" className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Trophy className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Stillinger</h2>
      </div>
      <Tabs defaultValue="drivers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="drivers">Kørere</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>
        <TabsContent value="drivers" className="space-y-4">
      {groupKeys.map((k) => {
        const [cls, cat] = k.split(" · ");
        const rows = allRows
          .filter((r) => r.car_class === cls && r.driver_category === cat)
          .sort((a, b) => b.total - a.total);
        if (rows.length === 0) return null;
        return (
          <Card key={k}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span>{cls}</span>
                <Badge variant="outline" className="text-[10px]">{cat}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2 w-8">#</th>
                    <th className="py-1 pr-2">Kører</th>
                    <th className="py-1 pr-2">Team</th>
                    <th className="py-1 pr-2 w-12 text-center">Nr.</th>
                    {completed.map((d: any) => (
                      <th key={d.id} className="py-1 px-1 w-12 text-center" title={d.name}>
                        {d.name.slice(0, 4)}
                      </th>
                    ))}
                    <th className="py-1 px-1 w-10 text-center" title="Fastest lap points">FL</th>
                    <th className="py-1 px-1 w-12 text-center" title="Samlet tidsstraf">Straf</th>
                    <th className="py-1 px-1 w-14 text-center" title="Samlet pointstraf">Pt-straf</th>
                    <th className="py-1 pl-2 w-12 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const tId = entryTeamMap[`${r.car_class}|${r.driver_category}|${r.car_number}`];
                    const teamName = tId ? (teamMap?.[tId] ?? "") : "";
                    return (
                    <tr key={r.car_number} className="border-t border-border">
                      <td className="py-1.5 pr-2 font-semibold tabular-nums">{i + 1}</td>
                      <td className="py-1.5 pr-2 truncate"><UserAvatar userId={entryUserMap[`${r.car_class}|${r.driver_category}|${r.car_number}`] ?? null} name={r.driver_name} size="sm" /></td>
                      <td className="py-1.5 pr-2 truncate text-xs text-muted-foreground">{teamName || "–"}</td>
                      <td className="py-1.5 pr-2 text-center font-mono text-xs">{r.car_number}</td>
                      {completed.map((d: any) => {
                        const cell = r.rounds[d.id];
                        if (!cell) return <td key={d.id} className="py-1.5 px-1 text-center text-muted-foreground">–</td>;
                        if (cell.dns) return <td key={d.id} className="py-1.5 px-1 text-center text-[10px] font-semibold text-destructive">DNS</td>;
                        return (
                          <td key={d.id} className="py-1.5 px-1 text-center tabular-nums text-muted-foreground">
                            <div className="inline-flex items-center gap-0.5">
                              <span>{cell.points}</span>
                              {cell.fl && <Zap className="h-3 w-3 text-primary" aria-label="Fastest lap" />}
                            </div>
                          </td>
                        );

                      })}
                      <td className="py-1.5 px-1 text-center tabular-nums text-muted-foreground">{r.fl || "–"}</td>
                      <td className="py-1.5 px-1 text-center tabular-nums text-destructive">{r.penalty > 0 ? `+${r.penalty}s` : "–"}</td>
                      <td className="py-1.5 px-1 text-center tabular-nums text-destructive">{r.pointPenalty > 0 ? `-${r.pointPenalty}` : "–"}</td>
                      <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{r.total}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
        </TabsContent>
        <TabsContent value="teams" className="space-y-4">
          <TeamStandings
            completed={completed}
            groupKeys={groupKeys}
            allRows={allRows}
            entryTeamMap={entryTeamMap}
            teamMap={teamMap ?? {}}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function TeamStandings({
  completed,
  groupKeys,
  allRows,
  entryTeamMap,
  teamMap,
}: {
  completed: any[];
  groupKeys: string[];
  allRows: Array<{ car_number: number; car_class: string; driver_category: string; rounds: Record<string, { points: number; flPts: number; pointPenalty: number; dns: boolean }> }>;
  entryTeamMap: Record<string, string | null>;
  teamMap: Record<string, string>;
}) {
  // For each (class·cat) group, compute per-round team points as the AVERAGE
  // points earned by team members in that round. Total team score = sum of
  // per-round averages. This keeps things fair when teams have different
  // numbers of drivers.
  return (
    <>
      <Card>
        <CardContent className="py-3 text-xs text-muted-foreground">
          Team-point pr. løb = gennemsnit af medlemmernes opnåede point i det løb. Samlet team-stilling = sum af runde-gennemsnit. På den måde får et mindre team ikke ulempe af at have færre kørere på banen.
        </CardContent>
      </Card>
      {groupKeys.map((k) => {
        const [cls, cat] = k.split(" · ");
        const groupRows = allRows.filter((r) => r.car_class === cls && r.driver_category === cat);
        if (groupRows.length === 0) return null;

        type TeamAgg = { teamId: string; rounds: Record<string, { sum: number; count: number }>; total: number; drivers: number };
        const teams = new Map<string, TeamAgg>();
        for (const r of groupRows) {
          const tId = entryTeamMap[`${r.car_class}|${r.driver_category}|${r.car_number}`];
          if (!tId) continue;
          let agg = teams.get(tId);
          if (!agg) { agg = { teamId: tId, rounds: {}, total: 0, drivers: 0 }; teams.set(tId, agg); }
          agg.drivers += 1;
          for (const d of completed) {
            const cell = r.rounds[d.id];
            if (!cell || cell.dns) continue;
            const pts = Math.max(0, cell.points + cell.flPts - cell.pointPenalty);
            const slot = agg.rounds[d.id] ?? { sum: 0, count: 0 };
            slot.sum += pts;
            slot.count += 1;
            agg.rounds[d.id] = slot;
          }
        }
        for (const agg of teams.values()) {
          agg.total = Object.values(agg.rounds).reduce((acc, s) => acc + (s.count > 0 ? s.sum / s.count : 0), 0);
        }
        const list = Array.from(teams.values()).sort((a, b) => b.total - a.total);
        if (list.length === 0) {
          return (
            <Card key={k}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><span>{cls}</span><Badge variant="outline" className="text-[10px]">{cat}</Badge></CardTitle>
              </CardHeader>
              <CardContent className="pt-0 py-4 text-center text-xs text-muted-foreground">Ingen team-tilmeldinger i denne klasse endnu.</CardContent>
            </Card>
          );
        }
        return (
          <Card key={k}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><span>{cls}</span><Badge variant="outline" className="text-[10px]">{cat}</Badge></CardTitle>
            </CardHeader>
            <CardContent className="pt-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2 w-8">#</th>
                    <th className="py-1 pr-2">Team</th>
                    <th className="py-1 pr-2 w-14 text-center">Kørere</th>
                    {completed.map((d: any) => (
                      <th key={d.id} className="py-1 px-1 w-14 text-center" title={d.name}>{d.name.slice(0, 4)}</th>
                    ))}
                    <th className="py-1 pl-2 w-14 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t, i) => (
                    <tr key={t.teamId} className="border-t border-border">
                      <td className="py-1.5 pr-2 font-semibold tabular-nums">{i + 1}</td>
                      <td className="py-1.5 pr-2 truncate">{teamMap[t.teamId] ?? "Team"}</td>
                      <td className="py-1.5 pr-2 text-center tabular-nums text-muted-foreground">{t.drivers}</td>
                      {completed.map((d: any) => {
                        const slot = t.rounds[d.id];
                        if (!slot || slot.count === 0) return <td key={d.id} className="py-1.5 px-1 text-center text-muted-foreground">–</td>;
                        return (
                          <td key={d.id} className="py-1.5 px-1 text-center tabular-nums text-muted-foreground" title={`${slot.sum} pt / ${slot.count} kørere`}>
                            {Math.floor(slot.sum / slot.count)}
                          </td>
                        );
                      })}
                      <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{Math.floor(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}


function SignupDialog({ leagueId, configs, signupOpensAt, approvedOnly }: { leagueId: string; configs: ClassConfig[]; signupOpensAt: string | null; approvedOnly: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: signups } = useLeagueSignups(leagueId);
  const assignDiscord = useServerFn(assignDiscordRoleForEntry);
  const checkGuild = useServerFn(checkDiscordGuildMembership);
  const ackFn = useServerFn(acknowledgeLeagueRules);
  const [open, setOpen] = useState(false);
  const [cfgIdx, setCfgIdx] = useState<string>("0");
  const [carNumber, setCarNumber] = useState<number | null>(null);
  const [teamId, setTeamId] = useState<string>("");
  const [carModel, setCarModel] = useState<string>("");
  const [ackChecked, setAckChecked] = useState(false);
  const { data: myTeams } = useMyTeams(user?.id);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name,lmu_name,approved")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { display_name: string | null; lmu_name: string | null; approved: boolean } | null;
    },
  });

  const driverName = (profile?.display_name ?? user?.email?.split("@")[0] ?? "").trim();
  const existingLmu = (profile?.lmu_name ?? "").trim();
  const [lmuInput, setLmuInput] = useState("");
  const effectiveLmu = (existingLmu || lmuInput).trim();

  const alreadySignedUp = !!user && (signups ?? []).some((s) => s.user_id === user.id);
  const signupOpen = !signupOpensAt ? false : new Date(signupOpensAt).getTime() <= Date.now();

  // (Tidligere auto-kategori-filter er fjernet — alle klasser er åbne for alle.
  //  Admin opdeler manuelt via "Opdel feltet i Pro & Am"-knappen når feltet er fyldt.)
  const filteredConfigs = configs;

  const selected = configs[Number(cfgIdx)];

  const { taken, available } = useMemo(() => {
    if (!selected) return { taken: [] as number[], available: [] as number[] };
    const t = (signups ?? [])
      .filter((s) => s.car_class === selected.car_class && s.driver_category === selected.driver_category && s.car_number != null)
      .map((s) => s.car_number as number);
    const a: number[] = [];
    for (let n = selected.number_from; n <= selected.number_to; n++) if (!t.includes(n)) a.push(n);
    return { taken: t, available: a };
  }, [signups, selected]);

  const gridCount = (signups ?? []).filter(
    (s) => selected && s.car_class === selected.car_class && s.driver_category === selected.driver_category && !s.waitlist,
  ).length;
  const cap = selected?.max_drivers ?? null;
  const isApproved = !!profile?.approved;
  const { isAdmin } = useAuth();
  const { data: rulesAck } = useMyRulesAck(leagueId, user?.id);
  const hasAcked = !!rulesAck;
  const effectiveAck = hasAcked || ackChecked;
  const goesToWaitlist = !isApproved || (cap != null && gridCount >= cap);

  // Leaderboard times gate (DB trigger enforces min 10 per car_class for non-admins)
  const { data: lbCount } = useQuery({
    queryKey: ["my-lb-count", user?.id, selected?.car_class],
    enabled: !!user && !!selected,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("leaderboard_times")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("car_class", selected!.car_class);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const needsMoreTimes = !isAdmin && selected != null && (lbCount ?? 0) < 10;

  const blockedByApprovedOnly = approvedOnly && !isApproved;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Du skal være logget ind.");
    if (!signupOpen) return toast.error("Tilmelding er ikke åbnet endnu.");
    if (blockedByApprovedOnly) return toast.error("Denne liga er kun åben for godkendte profiler.");
    if (!selected) return toast.error("Vælg en klasse.");
    if (carNumber == null) return toast.error("Vælg et kørenummer.");
    if (!carModel) return toast.error("Vælg din bil.");
    if (!driverName) return toast.error("Dit kørernavn mangler på profilen.");
    if (!effectiveLmu) return toast.error("Indtast dit LMU-navn præcis som det står i spillet.");
    if (!effectiveAck) return toast.error("Du skal bekræfte at du har læst og forstået reglementet.");

    // Discord guild membership gate
    try {
      const guild = await checkGuild();
      if (!guild.ok) {
        if (guild.reason === "not_linked") {
          return toast.error("Du skal forbinde din Discord-konto på din profil før du kan tilmelde dig.");
        }
        return toast.error("Du skal være medlem af LMU Danmark-discorden for at tilmelde dig en liga.");
      }
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "Kunne ikke verificere Discord-medlemskab.");
    }

    // Persist LMU name on profile if user just provided it
    if (!existingLmu && lmuInput.trim()) {
      const { error: pErr } = await supabase.from("profiles").update({ lmu_name: lmuInput.trim() }).eq("id", user.id);
      if (pErr) return toast.error(`Kunne ikke gemme LMU-navn: ${pErr.message}`);
    }

    // Persist rules acknowledgement if user just ticked the box
    if (!hasAcked && ackChecked) {
      try {
        await ackFn({ data: { leagueId } });
        qc.invalidateQueries({ queryKey: ["rules-ack", leagueId, user.id] });
      } catch (err) {
        return toast.error(err instanceof Error ? err.message : "Kunne ikke gemme reglement-bekræftelse.");
      }
    }

    const { error } = await supabase.from("entries").insert({
      league_id: leagueId,
      user_id: user.id,
      driver_name: driverName,
      car_class: selected.car_class,
      driver_category: selected.driver_category,
      car_number: carNumber,
      waitlist: goesToWaitlist,
      team_id: teamId || null,
      car_model: carModel || null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success(goesToWaitlist ? "Klassen er fyldt – du er tilføjet til ventelisten." : "Du er tilmeldt!");
    setOpen(false);
    setCarNumber(null);
    qc.invalidateQueries({ queryKey: ["league-signups", leagueId] });
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    // Send signup-confirmation email (non-blocking)
    if (user.email) {
      const { data: leagueRow } = await supabase
        .from("leagues")
        .select("name")
        .eq("id", leagueId)
        .maybeSingle();
      sendTransactionalEmail({
        templateName: "league-signup-confirmation",
        recipientEmail: user.email,
        idempotencyKey: `league-signup-${leagueId}-${user.id}`,
        templateData: { leagueName: leagueRow?.name ?? "din liga" },
      });
    }
    // Assign Discord role (non-blocking)
    try {
      const res = await assignDiscord({ data: { leagueId } });
      if (res?.ok) toast.success("Discord-rolle tildelt.");
      else if (res?.reason === "not_linked") {
        toast.info("Forbind din Discord-konto på din profil for at få rollen automatisk.");
      }
    } catch (err) {
      console.error("Discord role assign error", err);
    }
  };


  if (!user) {
    return <Button asChild size="sm" className="gap-2"><Link to="/login">Log ind for at tilmelde</Link></Button>;
  }
  if (configs.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2 px-6 text-base font-semibold shadow-lg shadow-primary/30 ring-2 ring-primary/40 hover:shadow-primary/50 hover:scale-[1.02] transition" disabled={alreadySignedUp || !signupOpen || blockedByApprovedOnly} title={blockedByApprovedOnly ? "Kun godkendte profiler kan tilmelde sig denne liga" : undefined}>
          <UserPlus className="h-5 w-5" /> {alreadySignedUp ? "Du er tilmeldt" : blockedByApprovedOnly ? "Kun godkendte" : signupOpen ? "Tilmeld dig" : "Tilmelding lukket"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tilmeld dig {league_name(leagueId)}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Kørernavn</Label>
            <Input value={driverName} disabled readOnly />
            <p className="mt-1 text-xs text-muted-foreground">Hentet fra din profil.</p>
          </div>
          <div>
            <Label>LMU-navn</Label>
            <Input
              value={existingLmu || lmuInput}
              onChange={(e) => setLmuInput(e.target.value)}
              disabled={!!existingLmu}
              readOnly={!!existingLmu}
              placeholder="Som det står i Le Mans Ultimate"
              required
              maxLength={80}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {existingLmu
                ? "Gemt på din profil – bruges til at koble løbsresultater til din konto."
                : "Skriv dit navn præcis som det står i spillet. Bruges til at matche dig i resultatfiler."}
            </p>
          </div>
          <div>
            <Label>Bilklasse</Label>
            <Select value={cfgIdx} onValueChange={(v) => { setCfgIdx(v); setCarNumber(null); setCarModel(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {filteredConfigs.map((c) => {
                  const i = configs.indexOf(c);
                  const col = classColor(c.car_class);
                  return (
                    <SelectItem key={i} value={String(i)}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                        {c.car_class} · {c.driver_category} (#{c.number_from}-{c.number_to})
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {selected && (CARS_BY_CLASS[selected.car_class]?.length ?? 0) > 0 && (
            <div>
              <Label>Bil</Label>
              <Select value={carModel} onValueChange={setCarModel}>
                <SelectTrigger><SelectValue placeholder={`Vælg ${selected.car_class}-bil`} /></SelectTrigger>
                <SelectContent>
                  {CARS_BY_CLASS[selected.car_class].map((car) => (
                    <SelectItem key={car} value={car}>{car}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Du kan ændre bil indtil første afdeling er kørt.</p>
            </div>
          )}
          {(myTeams ?? []).length > 0 && (
            <div>
              <Label>Team (valgfri)</Label>
              <Select value={teamId || "none"} onValueChange={(v) => setTeamId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Intet team" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Intet team</SelectItem>
                  {(myTeams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {selected && goesToWaitlist && (
            <p className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {!isApproved
                ? "Din profil er endnu ikke godkendt. Du tilmeldes ventelisten og rykker automatisk op på griddet, når en admin godkender dig."
                : `Klassen er fyldt (${gridCount}/${cap}). Du tilmeldes ventelisten og rykker op automatisk, hvis en plads bliver ledig.`}
            </p>
          )}

          {selected && (
            <div className="space-y-2">
              <Label>Kørenummer</Label>
              <div className="grid grid-cols-8 gap-1 rounded-md border border-border p-2 max-h-48 overflow-y-auto">
                {Array.from({ length: selected.number_to - selected.number_from + 1 }, (_, i) => selected.number_from + i).map((n) => {
                  const isTaken = taken.includes(n);
                  const isSel = carNumber === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={isTaken}
                      onClick={() => setCarNumber(n)}
                      className={`rounded px-1 py-1 text-xs ${isTaken ? "bg-muted text-muted-foreground line-through cursor-not-allowed" : isSel ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"}`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{available.length} ledige · {taken.length} optaget</p>
            </div>
          )}

          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Reglement</Label>
              <Link
                to="/ligaer/$leagueId/regler"
                params={{ leagueId }}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  <BookOpen className="h-4 w-4" /> Åbn reglement
                </Button>
              </Link>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="signup-rules-ack"
                checked={effectiveAck}
                disabled={hasAcked}
                onCheckedChange={(v) => setAckChecked(!!v)}
                className="mt-0.5"
              />
              <label htmlFor="signup-rules-ack" className="cursor-pointer text-xs leading-relaxed">
                Jeg har læst og forstået reglementet.
                {hasAcked && <span className="ml-1 text-muted-foreground">(allerede bekræftet)</span>}
              </label>
            </div>
          </div>

          <DialogFooter><Button type="submit" disabled={carNumber == null || !carModel || !effectiveAck}>{goesToWaitlist ? "Tilmeld til venteliste" : "Tilmeld"}</Button></DialogFooter>

        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickNav() {
  const items = [
    { id: "entryliste", label: "Entryliste", icon: Users },
    { id: "kalender", label: "Kalender", icon: Calendar },
    { id: "driveraids", label: "Driver Aids", icon: SettingsIcon },
    { id: "stillinger", label: "Stillinger", icon: Trophy },
  ];

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollTo(item.id)}
          className="group flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <item.icon className="h-4 w-4" />
          </span>
          <span className="truncate text-xs font-medium">{item.label}</span>
        </button>
      ))}
    </div>

  );
}

function DriverAidsView({ settings }: { settings: EventSettings }) {
  const aidRows = EVENT_AID_FIELDS
    .map((f) => {
      const v = settings[f.key] as string | undefined;
      return v ? { label: f.label, value: v } : null;
    })
    .filter(Boolean) as { label: string; value: string }[];

  return (
    <section id="driveraids" className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <SettingsIcon className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Driver Aids</h2>
      </div>
      {aidRows.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Ingen driver aids angivet endnu.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4">
            <table className="w-full text-sm">
              <tbody>
                {aidRows.map((r) => (
                  <tr key={r.label} className="border-t border-border first:border-t-0">
                    <td className="py-1.5 pr-2 text-muted-foreground">{r.label}</td>
                    <td className="py-1.5 text-right">
                      <Badge variant={r.value === "On" ? "default" : "secondary"} className="text-[10px]">{r.value}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}



function league_name(_id: string) {
  return "ligaen";
}

function useMyEntry(leagueId: string, userId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-entry", leagueId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id,waitlist")
        .eq("league_id", leagueId)
        .is("division_id", null)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useMyRulesAck(leagueId: string, userId: string | null | undefined) {
  return useQuery({
    queryKey: ["rules-ack", leagueId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_rules_acknowledgements")
        .select("acknowledged_at")
        .eq("league_id", leagueId)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function RulesButton({ leagueId }: { leagueId: string }) {
  return (
    <Link to="/ligaer/$leagueId/regler" params={{ leagueId }}>
      <Button variant="outline" size="sm" className="gap-2">
        <BookOpen className="h-4 w-4" /> Se regelsæt
      </Button>
    </Link>
  );
}


function LeaveLeagueButton({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: signups } = useLeagueSignups(leagueId);
  const leave = useServerFn(leaveLeague);
  const removeDiscord = useServerFn(removeDiscordRoleForEntry);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user) return null;
  const mine = (signups ?? []).find((s) => s.user_id === user.id);
  if (!mine) return null;

  const onConfirm = async () => {
    setLoading(true);
    try {
      const res = await leave({ data: { leagueId } });
      if (res.promotedDriver) {
        toast.success(`Du er meldt ud. ${res.promotedDriver} er rykket op fra ventelisten.`);
      } else {
        toast.success("Du er meldt ud af ligaen.");
      }
      // Best-effort: fjern Discord-rolle
      try { await removeDiscord({ data: { leagueId } }); } catch (e) { console.error(e); }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["league-signups", leagueId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke melde dig ud.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserMinus className="h-4 w-4" /> Meld dig ud
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Meld dig ud af ligaen?</AlertDialogTitle>
          <AlertDialogDescription>
            Din tilmelding bliver slettet. Hvis du stod på griddet, rykker den første på ventelisten automatisk op og får besked.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Annullér</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); void onConfirm(); }} disabled={loading}>
            {loading ? "Melder ud…" : "Ja, meld mig ud"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EditEntryDialog({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: signups } = useLeagueSignups(leagueId);
  const { data: myTeams } = useMyTeams(user?.id);
  const [open, setOpen] = useState(false);

  const myEntry = useMemo(
    () => (signups ?? []).find((s) => user && s.user_id === user.id) as any,
    [signups, user],
  );

  const { data: divs } = useQuery({
    queryKey: ["league-divisions-completed", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id,settings")
        .eq("league_id", leagueId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const locked = (divs ?? []).some((d: any) => !!d?.settings?.completed);

  const [carModel, setCarModel] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");

  useEffect(() => {
    if (myEntry) {
      setCarModel(myEntry.car_model ?? "");
      setTeamId(myEntry.team_id ?? "");
    }
  }, [myEntry?.id]);

  if (!user || !myEntry) return null;

  const cars = CARS_BY_CLASS[myEntry.car_class] ?? [];

  const save = async () => {
    if (locked) return toast.error("Første afdeling er kørt – bilvalg er låst.");
    if (!carModel) return toast.error("Vælg din bil.");
    const { error } = await (supabase as any)
      .from("entries")
      .update({ car_model: carModel, team_id: teamId || null })
      .eq("id", myEntry.id);
    if (error) return toast.error(error.message);
    toast.success("Tilmelding opdateret.");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["league-signups", leagueId] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <SettingsIcon className="h-4 w-4" /> Rediger tilmelding
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Rediger din tilmelding</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            {myEntry.car_class} · #{myEntry.car_number}
          </div>
          {cars.length > 0 && (
            <div>
              <Label>Bil</Label>
              <Select value={carModel} onValueChange={setCarModel} disabled={locked}>
                <SelectTrigger><SelectValue placeholder={`Vælg ${myEntry.car_class}-bil`} /></SelectTrigger>
                <SelectContent>
                  {cars.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Team</Label>
            <Select value={teamId || "none"} onValueChange={(v) => setTeamId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Intet team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Intet team</SelectItem>
                {(myTeams ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {locked && (
            <p className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              Første afdeling er kørt – bilvalg kan ikke længere ændres.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={locked}>Gem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RaceResultRow = {
  id: string;
  division_id: string | null;
  car_class: string;
  car_model: string | null;
  best_lap_ms: number | null;
  position: number | null;
  session_type: string;
  user_id: string;
};

function msToLap(ms: number | null) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s;
}

function RaceDataResults({ leagueId }: { leagueId: string }) {
  const [view, setView] = useState<"race" | "qualifying">("race");

  const { data: rows } = useQuery({
    queryKey: ["league-results-xml", leagueId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("league_results")
        .select("id,division_id,car_class,car_model,best_lap_ms,position,session_type,user_id")
        .eq("league_id", leagueId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RaceResultRow[];
    },
  });

  const { data: divisions } = useQuery({
    queryKey: ["league-divisions-lite", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id,name,race_date")
        .eq("league_id", leagueId)
        .order("race_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const userIds = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.user_id))), [rows]);
  const { data: profiles } = useQuery({
    queryKey: ["profiles-names", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,display_name,lmu_name").in("id", userIds);
      if (error) throw error;
      const m: Record<string, string> = {};
      for (const p of (data ?? []) as any[]) m[p.id] = p.display_name ?? p.lmu_name ?? "Kører";
      return m;
    },
  });

  const filtered = (rows ?? []).filter((r) => r.session_type === view);
  if (!rows || rows.length === 0) return null;

  const byDiv = new Map<string, RaceResultRow[]>();
  for (const r of filtered) {
    const k = r.division_id ?? "_";
    if (!byDiv.has(k)) byDiv.set(k, []);
    byDiv.get(k)!.push(r);
  }
  const divName = (id: string | null) => (divisions ?? []).find((d: any) => d.id === id)?.name ?? "Afdeling";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Resultatfiler</h2>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setView("race")}
            className={`px-3 py-1 text-xs font-medium rounded ${view === "race" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Race results
          </button>
          <button
            type="button"
            onClick={() => setView("qualifying")}
            className={`px-3 py-1 text-xs font-medium rounded ${view === "qualifying" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Quali results
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Ingen {view === "race" ? "race" : "quali"}-fil uploadet endnu.
          </CardContent>
        </Card>
      ) : (
        Array.from(byDiv.entries()).map(([divId, items]) => {
          const byClass = new Map<string, RaceResultRow[]>();
          for (const r of items) {
            if (!byClass.has(r.car_class)) byClass.set(r.car_class, []);
            byClass.get(r.car_class)!.push(r);
          }
          return (
            <div key={divId} className="space-y-3">
              <div className="text-sm font-semibold">{divName(divId === "_" ? null : divId)}</div>
              {Array.from(byClass.entries()).map(([cls, list]) => (
                <Card key={cls}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>{cls}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-2 w-8">#</th>
                          <th className="py-1 pr-2">Kører</th>
                          <th className="py-1 pr-2">Bil</th>
                          <th className="py-1 pl-2 w-24 text-right">Bedste omg.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list
                          .slice()
                          .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
                          .map((r) => (
                            <tr key={r.id} className="border-t border-border">
                              <td className="py-1.5 pr-2 font-semibold tabular-nums">{r.position ?? "–"}</td>
                              <td className="py-1.5 pr-2 truncate">{profiles?.[r.user_id] ?? "Kører"}</td>
                              <td className="py-1.5 pr-2 truncate text-xs text-muted-foreground">{r.car_model ?? "–"}</td>
                              <td className="py-1.5 pl-2 text-right font-mono tabular-nums">{msToLap(r.best_lap_ms)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}
