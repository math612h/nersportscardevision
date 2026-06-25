import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpRight, Calendar, ChevronDown, ChevronUp, EyeOff, ExternalLink, Flag, MapPin, MessageCircle, MessageSquareWarning, MoreHorizontal, Smartphone, Trophy, Users } from "lucide-react";
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
          d.settings.results.length > 0,
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

  // Team-stilling for seneste løb: kun bekræftede team-tilmeldinger med ≥2 accepterede lineup-kørere
  const { data: latestTeamStandings } = useQuery({
    queryKey: ["home-latest-team-standings", latest?.id, latest?.league_id],
    enabled: !!latest?.id && !!latest?.league_id,
    queryFn: async () => {
      const results = (latest?.settings?.results ?? []) as ResultRow[];
      if (results.length === 0) return [] as { car_class: string; teams: { teamId: string; name: string; points: number; drivers: number }[] }[];

      const { data: entries } = await (supabase as any)
        .from("league_team_entries")
        .select("id, team_id, car_class, status, teams:team_id(name), league_team_lineup(user_id, status)")
        .eq("league_id", latest.league_id)
        .eq("status", "confirmed");

      // For each (class, team) collect accepted lineup user_ids; require ≥2
      type Info = { teamId: string; name: string; carClass: string; userIds: Set<string> };
      const teamInfos: Info[] = [];
      for (const e of (entries ?? []) as any[]) {
        const accepted = ((e.league_team_lineup ?? []) as any[])
          .filter((l) => l.status === "accepted")
          .map((l) => l.user_id as string);
        if (accepted.length < 2) continue;
        teamInfos.push({
          teamId: e.team_id,
          name: e.teams?.name ?? "Team",
          carClass: e.car_class,
          userIds: new Set(accepted),
        });
      }
      if (teamInfos.length === 0) return [];

      // Sum points per (class, team), counting only drivers from accepted lineup who actually scored
      const byClass = new Map<string, Map<string, { sum: number; count: number; name: string }>>();
      for (const r of results) {
        if (r.dns || !r.user_id) continue;
        for (const info of teamInfos) {
          if (info.carClass !== r.car_class) continue;
          if (!info.userIds.has(r.user_id as string)) continue;
          if (!byClass.has(r.car_class)) byClass.set(r.car_class, new Map());
          const m = byClass.get(r.car_class)!;
          const slot = m.get(info.teamId) ?? { sum: 0, count: 0, name: info.name };
          slot.sum += Number(r.points ?? 0);
          slot.count += 1;
          m.set(info.teamId, slot);
        }
      }

      const groups: { car_class: string; teams: { teamId: string; name: string; points: number; drivers: number }[] }[] = [];
      for (const [cls, m] of byClass.entries()) {
        const teamsList = Array.from(m.entries())
          .filter(([, s]) => s.count >= 2) // lineup-kravet: min 2 deltagere skal have kørt
          .map(([teamId, s]) => ({ teamId, name: s.name, points: s.sum, drivers: s.count }))
          .sort((a, b) => b.points - a.points)
          .slice(0, 3);
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
              {groupedResults.map((group) => (
                <div key={group.key} className="space-y-2 rounded-md border border-border p-3">
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
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {latest && latestTeamStandings && latestTeamStandings.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Users className="h-4 w-4" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Team-stilling (seneste løb)</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {latestTeamStandings.map((g) => (
              <div key={g.car_class} className="space-y-2 rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold">{g.car_class}</h3>
                <ol className="space-y-1.5">
                  {g.teams.map((t, i) => {
                    const medal =
                      i === 0
                        ? "bg-amber-400/20 text-amber-700 ring-1 ring-amber-400/40 dark:text-amber-300"
                        : i === 1
                        ? "bg-slate-300/30 text-slate-700 ring-1 ring-slate-400/40 dark:text-slate-200"
                        : "bg-orange-500/15 text-orange-700 ring-1 ring-orange-500/30 dark:text-orange-300";
                    return (
                      <li key={t.teamId} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded font-semibold tabular-nums ${medal}`}>
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {t.drivers} {t.drivers === 1 ? "kører" : "kørere"}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">
                          {Math.floor(t.points)} p
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Team-point = gennemsnit af medlemmernes opnåede point i løbet.
          </p>
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

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!posts || posts.length === 0) return null;

  return (
    <section className="space-y-4">
      {posts.map((post) => {
        const isExpanded = expanded[post.id] ?? false;
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
                    className={`prose-news text-sm text-foreground/90 ${isExpanded ? "" : "line-clamp-3"}`}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }}
                  />
                  <button
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                    }
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" /> Vis mindre
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" /> Se mere...
                      </>
                    )}
                  </button>
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


