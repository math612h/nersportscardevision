import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpRight, Calendar, ChevronDown, ChevronUp, EyeOff, ExternalLink, Flag, MapPin, MessageCircle, MessageSquareWarning, MoreHorizontal, Smartphone, Trophy, Users, Video } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProfileComplete } from "@/hooks/use-profile-complete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTrackImageFile } from "@/lib/tracks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DOMPurify from "isomorphic-dompurify";
import { AddressConsentBanner } from "@/components/AddressConsentBanner";
import { UserAvatarOnly } from "@/components/UserAvatar";
import { TeamAvatarOnly } from "@/components/TeamAvatar";

const PAGE_TITLE = "Nyheder — LMU Danmark";
const PAGE_DESC =
  "Seneste afviklede løb i LMU Danmark med baneinfo, klassevindere og top 3-resultater.";
const PAGE_URL = "https://danishenduranceseries.dk/";

type ResultRow = {
  car_number?: number;
  user_id?: string;

  driver_name: string;
  car_class: string;
  driver_category?: string;
  class_position?: number;
  points?: number;
  fastest_lap?: boolean;
  dns?: boolean;
  dnf?: boolean;
};

export const Route = createFileRoute("/")({
  component: NewsHome,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:url", content: PAGE_URL },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
});

function NewsHome() {
  const { isAdmin, user, isGuest } = useAuth();
  const { complete: profileComplete, signedIn } = useProfileComplete();
  const { t } = useTranslation();
  const gated = signedIn && !profileComplete && !isGuest;
  const qc = useQueryClient();

  const { data: pendingIncidents = 0 } = useQuery({
    queryKey: ["home-pending-incidents", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: protests, error: pe }, { data: offers, error: oe }] = await Promise.all([
        supabase
          .from("protest_involved")
          .select("id, response, protests!inner(status)")
          .eq("user_id", user!.id)
          .is("response", null),
        supabase
          .from("division_reserve_offers")
          .select("id,expires_at,status")
          .eq("offered_user_id", user!.id)
          .eq("status", "pending"),
      ]);
      if (pe) throw pe;
      if (oe) throw oe;
      const protestCount = (protests ?? []).filter((r: any) => r.protests?.status !== "ruled").length;
      const now = Date.now();
      const offerCount = (offers ?? []).filter((o: any) => new Date(o.expires_at).getTime() > now).length;
      return protestCount + offerCount;
    },
  });
  const { data: divisions, isLoading } = useQuery({
    queryKey: ["home-recent-results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id,league_id,name,track,layout,race_date,created_at,settings,leagues(name)")
        .order("race_date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).filter(
        (d: any) =>
          d.settings?.completed &&
          !d.settings?.hidden_from_home &&
          Array.isArray(d.settings?.results) &&
          d.settings.results.some((r: ResultRow) => Number(r.class_position) > 0 && !r.dns && !r.dnf),
      );
    },
  });

  const hideLatest = async (d: any) => {
    if (!confirm(`Skjul "${d.name}" fra forsiden?`)) return;
    const newSettings = { ...(d.settings ?? {}), hidden_from_home: true };
    const { error } = await supabase
      .from("divisions")
      .update({ settings: newSettings as any })
      .eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Skjult fra forsiden");
    qc.invalidateQueries({ queryKey: ["home-recent-results"] });
  };

  const latest = divisions?.[0] as any | undefined;
  const otherResults = (divisions ?? []).slice(1, 4) as any[];
  const trackFile = getTrackImageFile(latest?.track);

  const { data: trackImageMap } = useQuery({
    queryKey: ["home-track-image", trackFile ?? "none"],
    enabled: !!trackFile,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("track-images")
        .createSignedUrls([trackFile!], 60 * 60 * 24 * 7);
      if (error) throw error;
      return data?.[0]?.signedUrl ?? null;
    },
  });

  const groupedResults = groupTopThree((latest?.settings?.results ?? []) as ResultRow[]);

  // Team-stilling for seneste løb: median af lineup-medlemmernes positioner;
  // P1 = 30 point, derefter ligaens points_per_position. Min. 2 deltagende.
  const { data: latestTeamStandings } = useQuery({
    queryKey: ["home-latest-team-standings-v3", latest?.id, latest?.league_id],
    enabled: !!latest?.id && !!latest?.league_id,
    queryFn: async () => {
      const results = (latest?.settings?.results ?? []) as ResultRow[];
      if (results.length === 0) return [] as { car_class: string; teams: { teamId: string; name: string; points: number; drivers: number }[] }[];

      const [{ data: leagueRow }, { data: teamEntries, error: teamEntriesError }] = await Promise.all([
        supabase.from("leagues").select("points_system").eq("id", latest.league_id).maybeSingle(),
        (supabase as any)
          .from("league_team_entries")
          .select("id, team_id, car_class, status, teams:team_id(name), league_team_lineup(user_id, status)")
          .eq("league_id", latest.league_id)
          .eq("status", "confirmed"),
      ]);
      if (teamEntriesError) throw teamEntriesError;

      const pointsPerPosition: number[] = Array.isArray((leagueRow?.points_system as any)?.points_per_position)
        ? (leagueRow!.points_system as any).points_per_position.map((n: any) => Number(n) || 0) : [];

      const { computeTeamRacePoints } = await import("@/lib/team-points");
      const teams = ((teamEntries ?? []) as any[]).flatMap((e) => {
        const accepted = ((e.league_team_lineup ?? []) as any[])
          .filter((l) => l.status === "accepted")
          .map((l) => l.user_id as string);
        if (accepted.length < 2) return [];
        return [{
          teamId: e.team_id,
          teamName: e.teams?.name ?? "Team",
          carClass: e.car_class,
          userIds: new Set(accepted),
        }];
      });
      if (teams.length === 0) return [];

      const ranked = computeTeamRacePoints({
        results: results.map((r) => ({
          user_id: r.user_id ?? null,
          car_class: r.car_class,
          class_position: r.class_position ?? null,
          dns: r.dns,
          dnf: r.dnf,
        })),
        teams,
        pointsPerPosition,
      });
      const groups: { car_class: string; teams: { teamId: string; name: string; points: number; drivers: number }[] }[] = [];
      for (const [cls, list] of ranked.entries()) {
        const teamsList = list
          .filter((t) => t.rank > 0)
          .slice(0, 3)
          .map((t) => ({ teamId: t.teamId, name: t.teamName, points: t.points, drivers: t.participants }));
        if (teamsList.length > 0) groups.push({ car_class: cls, teams: teamsList });
      }
      return groups;
    },
  });



  if (gated) {
    return (
      <div className="space-y-10">
        <ProfileCompletionGate />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {user && !isGuest && <ProfileCompletionGate />}
      {user && !isGuest && <AddressConsentBanner />}
      <header className="space-y-3">

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {t("home.kicker")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{t("home.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="gap-2">
            <Link to="/lmu/liga">
              <Flag className="h-4 w-4" /> {t("home.leagues")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/ugens-overhaling">
              <Video className="h-4 w-4" /> Ugens Overhaling
            </Link>
          </Button>
          {user && (
            <Button asChild variant="outline" className="relative gap-2">
              <Link to="/mine-protests">
                <MessageSquareWarning className="h-4 w-4" /> {t("home.incidents")}
                {pendingIncidents > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
                    {pendingIncidents}
                  </span>
                )}
              </Link>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <MoreHorizontal className="h-4 w-4" /> {t("home.more")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem asChild>
                <Link to="/lmu/teams"><ArrowUpRight className="h-4 w-4" /> {t("home.teams")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/brugere"><Users className="h-4 w-4" /> {t("home.users")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="https://discord.gg/bwVMAfrm55" target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" /> {t("home.discord")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/app-guide"><Smartphone className="h-4 w-4" /> {t("home.appGuide")}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <NewsPostsSection />

      <OvertakingWinnerSection />

      {isLoading && (
        <div className="h-96 animate-pulse rounded-xl border border-border bg-card/50" />
      )}

      {!isLoading && !latest && (
        <section className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("home.emptyState")}
        </section>
      )}

      {latest && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2 text-primary">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Seneste løb</h2>
            </div>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => hideLatest(latest)}
                className="gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <EyeOff className="h-3.5 w-3.5" /> Skjul fra forsiden
              </Button>
            )}
          </div>
          <article className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted sm:aspect-[21/9]">
              {trackImageMap ? (
                <img
                  src={trackImageMap}
                  alt={latest.track ?? latest.name}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-transparent" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/45 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 space-y-3 p-4 sm:p-6">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Afsluttet</Badge>
                  {latest.leagues?.name && <Badge variant="outline">{latest.leagues.name}</Badge>}
                  {latest.race_date && (
                    <Badge variant="outline" className="gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(latest.race_date), "dd MMM yyyy")}
                    </Badge>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight sm:text-3xl">{latest.name}</h2>
                  {latest.track && (
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {latest.track}
                      {latest.layout ? ` · ${latest.layout}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              {groupedResults.map((group) => {
                const teamGroup = (latestTeamStandings ?? []).find((g) => g.car_class === group.key);
                return (
                <div key={group.key} className="space-y-3 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{group.label}</h3>
                    {group.winner && (
                      <Badge className="gap-1">
                        <Trophy className="h-3 w-3" />
                        {group.winner.driver_name}
                      </Badge>
                    )}
                  </div>
                  <ol className="grid gap-2 sm:grid-cols-3">
                    {group.top.map((row) => {
                      const pos = Number(row.class_position);
                      const medal =
                        pos === 1
                          ? "bg-amber-400/20 text-amber-700 ring-1 ring-amber-400/40 dark:text-amber-300"
                          : pos === 2
                          ? "bg-slate-300/30 text-slate-700 ring-1 ring-slate-400/40 dark:text-slate-200"
                          : pos === 3
                          ? "bg-orange-500/15 text-orange-700 ring-1 ring-orange-500/30 dark:text-orange-300"
                          : "bg-background";
                      return (
                        <li
                          key={`${group.key}-${row.class_position}-${row.driver_name}`}
                          className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                        >
                          <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded font-semibold tabular-nums ${medal}`}>
                            {row.class_position}
                          </span>
                          <UserAvatarOnly userId={row.user_id ?? null} fallbackName={row.driver_name} size="sm" />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {row.driver_name}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {row.points ?? 0} p
                          </span>
                        </li>
                      );
                    })}
                  </ol>

                  {teamGroup && teamGroup.teams.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.15em]">Team-stilling</span>
                      </div>
                      <ol className="grid gap-2 sm:grid-cols-3">
                        {teamGroup.teams.map((tm, i) => {
                          const pos = i + 1;
                          const medal =
                            pos === 1
                              ? "bg-amber-400/20 text-amber-700 ring-1 ring-amber-400/40 dark:text-amber-300"
                              : pos === 2
                              ? "bg-slate-300/30 text-slate-700 ring-1 ring-slate-400/40 dark:text-slate-200"
                              : "bg-orange-500/15 text-orange-700 ring-1 ring-orange-500/30 dark:text-orange-300";
                          return (
                            <li
                              key={tm.teamId}
                              className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                            >
                              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded font-semibold tabular-nums ${medal}`}>
                                {pos}
                              </span>
                              <TeamAvatarOnly teamId={tm.teamId} fallbackName={tm.name} size="sm" />
                              <span className="min-w-0 flex-1 truncate font-medium">{tm.name}</span>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {tm.points} p
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </article>
        </section>
      )}





      {otherResults.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Calendar className="h-4 w-4" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Tidligere løb</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {otherResults.map((d) => (
              <div key={d.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold">{d.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{d.leagues?.name ?? "Liga"}</p>
                {d.track && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {d.track}
                    {d.layout ? ` · ${d.layout}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function groupTopThree(results: ResultRow[]) {
  const groups = new Map<string, ResultRow[]>();
  for (const r of results) {
    if (r.dns || r.dnf || !r.driver_name) continue;
    const key = r.car_class ?? "Ukendt klasse";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  return Array.from(groups.entries())
    .map(([key, rows]) => {
      const top = rows
        .filter((r) => Number(r.class_position) > 0)
        .sort((a, b) => Number(a.class_position) - Number(b.class_position))
        .slice(0, 3);
      return { key, label: key, top, winner: top[0] };
    })
    .filter((g) => g.top.length > 0);
}

type NewsPost = {
  id: string;
  title: string;
  body: string | null;
  image_path: string | null;
  expires_at: string;
};

function NewsPostsSection() {
  const { data: posts } = useQuery({
    queryKey: ["home-news-posts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("news_posts")
        .select("id,title,body,image_path,expires_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NewsPost[];
    },
  });

  const imagePaths = (posts ?? []).map((p) => p.image_path).filter((p): p is string => !!p);

  const { data: imageMap } = useQuery({
    queryKey: ["home-news-images", imagePaths.sort().join(",")],
    enabled: imagePaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("news-images")
        .createSignedUrls(imagePaths, 60 * 60 * 24 * 7);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => {
        if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      });
      return m;
    },
  });

  if (!posts || posts.length === 0) return null;

  return (
    <section className="space-y-4">
      {posts.map((post) => {
        return (
          <article
            key={post.id}
            className="overflow-hidden rounded-xl border border-primary/30 bg-card"
          >
            <div className="space-y-3 p-4 sm:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Nyhed</p>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{post.title}</h2>
              {post.body && (
                <>
                  <div
                    className="prose-news text-sm text-foreground/90 line-clamp-3"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }}
                  />
                  <Link
                    to="/nyheder"
                    hash={`post-${post.id}`}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <ChevronDown className="h-3.5 w-3.5" /> Se mere...
                  </Link>
                </>
              )}
            </div>
            {post.image_path && imageMap?.[post.image_path] && (
              <div className="relative max-h-64 w-full overflow-hidden">
                <img
                  src={imageMap[post.image_path]}
                  alt={post.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function ProfileCompletionGate() {
  const { user } = useAuth();
  const { data: status } = useQuery({
    queryKey: ["onboarding-status", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: profile }, { data: priv }] = await Promise.all([
        supabase.from("profiles").select("display_name, lmu_name, accepts_danish, media_consent").eq("id", user!.id).maybeSingle(),
        (supabase as unknown as { from: (t: string) => any }).from("profiles_private")
          .select("discord_user_id, address, postal_code, city").eq("user_id", user!.id).maybeSingle(),
      ]);
      const p = (priv ?? {}) as any;
      const pr = (profile ?? {}) as any;
      const email = (user?.email ?? "").trim();
      const hasRealEmail = !!email && !email.endsWith("@no-email.lmudanmark.dk");
      const complete = !!p.discord_user_id
        && !!(pr.lmu_name ?? "").trim()
        && !!(pr.display_name ?? "").trim()
        && hasRealEmail
        && pr.accepts_danish === true
        && pr.media_consent === true;
      return { complete };
    },
  });
  if (!status || status.complete) return null;
  return (
    <section className="rounded-2xl border-2 border-destructive/50 bg-destructive p-6 text-destructive-foreground shadow-lg sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Udfyld og færdiggør din profil for at fortsætte
          </h2>
          <p className="text-sm text-destructive-foreground/80">
            Du skal udfylde alle felter på din profil, før du kan bruge platformen fuldt ud.
          </p>
        </div>
        <Button asChild size="lg" variant="secondary" className="shrink-0 font-semibold">
          <Link to="/profil">Gå til min profil</Link>
        </Button>
      </div>
    </section>
  );
}

function OvertakingWinnerSection() {
  // Sidste afsluttede uge = for én uge siden (mandag).
  const { getCurrentWeekStartISO, shiftWeek, weekLabel, youtubeEmbedUrl } = require("@/lib/overtaking-utils") as typeof import("@/lib/overtaking-utils");
  const lastWeek = shiftWeek(getCurrentWeekStartISO(), -1);

  const { data: clips = [] } = useQuery({
    queryKey: ["home-overtaking-clips", lastWeek],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("overtaking_clips")
        .select("id,user_id,youtube_id,title,week_start")
        .eq("week_start", lastWeek);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; user_id: string; youtube_id: string; title: string | null; week_start: string }>;
    },
  });

  const clipIds = clips.map((c) => c.id);

  const { data: votes = [] } = useQuery({
    queryKey: ["home-overtaking-votes", lastWeek, clipIds.join(",")],
    enabled: clipIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("overtaking_votes").select("clip_id").in("clip_id", clipIds);
      if (error) throw error;
      return (data ?? []) as Array<{ clip_id: string }>;
    },
  });

  const winner = (() => {
    if (clips.length === 0) return null;
    const counts = new Map<string, number>();
    votes.forEach((v) => counts.set(v.clip_id, (counts.get(v.clip_id) ?? 0) + 1));
    let best: (typeof clips)[number] | null = null;
    let bestCount = 0;
    for (const c of clips) {
      const n = counts.get(c.id) ?? 0;
      if (n > bestCount) { best = c; bestCount = n; }
    }
    return best && bestCount > 0 ? { clip: best, votes: bestCount } : null;
  })();

  const { data: profile } = useQuery({
    queryKey: ["home-overtaking-winner-profile", winner?.clip.user_id],
    enabled: !!winner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("id,display_name,lmu_name").eq("id", winner!.clip.user_id).maybeSingle();
      if (error) throw error;
      return data as { id: string; display_name: string | null; lmu_name: string | null } | null;
    },
  });

  if (!winner) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-primary">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Ugens Overhaling</h2>
        </div>
        <Link
          to="/ugens-overhaling"
          className="text-xs font-medium text-primary hover:underline"
        >
          Se alle klip →
        </Link>
      </div>
      <article className="overflow-hidden rounded-xl border border-amber-400/40 bg-card">
        <div className="aspect-video w-full bg-muted">
          <iframe
            src={youtubeEmbedUrl(winner.clip.youtube_id)}
            title={winner.clip.title ?? "Ugens Overhaling"}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <UserAvatarOnly userId={winner.clip.user_id} fallbackName={profile?.display_name ?? "Kører"} size="md" />
            <div>
              <p className="text-sm font-semibold">{profile?.display_name ?? profile?.lmu_name ?? "Kører"}</p>
              <p className="text-xs text-muted-foreground">{weekLabel(lastWeek)}</p>
            </div>
          </div>
          <Badge className="gap-1"><Trophy className="h-3 w-3" /> {winner.votes} stemmer</Badge>
        </div>
      </article>
    </section>
  );
}



