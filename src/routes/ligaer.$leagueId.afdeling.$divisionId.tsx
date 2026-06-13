import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Calendar, MapPin, MessageSquareWarning, UserX, UserCheck, Users, KeyRound, Lock, CheckCircle2, Timer, Trophy, Clock } from "lucide-react";
import { msToLapStr } from "@/lib/lmu-parser";
import { format, formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { triggerReserveOfferForAbsence, cancelReserveOffersForAbsence, respondReserveOffer } from "@/lib/division-reserves.functions";
import { WEATHER_BY_KEY, type WeatherKey, type ClassConfig, type EventSettings, EVENT_NUMERIC_FIELDS } from "@/lib/tracks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DriverLink } from "@/components/DriverLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
const DriversBriefing = lazy(() => import("@/components/DriversBriefing").then(m => ({ default: m.DriversBriefing })));

export const Route = createFileRoute("/ligaer/$leagueId/afdeling/$divisionId")({
  component: DivisionDetail,
  loader: async ({ params }) => {
    const [{ data: divData }, { data: leagueData }] = await Promise.all([
      supabase.from("divisions").select("name, track, layout, race_date").eq("id", params.divisionId).maybeSingle(),
      supabase.from("leagues").select("name").eq("id", params.leagueId).maybeSingle(),
    ]);
    return {
      divName: (divData?.name as string | undefined) ?? null,
      track: (divData?.track as string | undefined) ?? null,
      layout: (divData?.layout as string | undefined) ?? null,
      raceDate: (divData?.race_date as string | undefined) ?? null,
      leagueName: (leagueData?.name as string | undefined) ?? null,
    };
  },
  head: ({ params, loaderData }) => {
    const div = loaderData?.divName ?? "Afdeling";
    const league = loaderData?.leagueName ?? "";
    const trackStr = loaderData?.track
      ? `${loaderData.track}${loaderData.layout ? ` (${loaderData.layout})` : ""}`
      : "";
    const title = `${div}${league ? ` – ${league}` : ""} | LMU Danmark`;
    const desc =
      `Detaljer for afdelingen ${div}${league ? ` i ${league}` : ""}: ` +
      `${trackStr ? `${trackStr}, ` : ""}deltagere, lobby info og protest-formular.`;
    const url = `https://danishenduranceseries.dk/ligaer/${params.leagueId}/afdeling/${params.divisionId}`;
    const scripts: Array<{ type: string; children: string }> = [];
    if (loaderData?.divName) {
      scripts.push({
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          name: `${div}${league ? ` – ${league}` : ""}`,
          ...(loaderData.raceDate ? { startDate: loaderData.raceDate } : {}),
          ...(loaderData.track
            ? {
                location: {
                  "@type": "Place",
                  name: trackStr,
                },
              }
            : {}),
          url,
          eventStatus: "https://schema.org/EventScheduled",
          organizer: {
            "@type": "Organization",
            name: "LMU Danmark",
          },
        }),
      });
    }
    return {
      meta: [
        { title },
        { name: "description", content: desc.slice(0, 160) },
        { property: "og:title", content: title },
        { property: "og:description", content: desc.slice(0, 160) },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts,
    };
  },
});

function DivisionDetail() {
  const { leagueId, divisionId } = useParams({ from: "/ligaer/$leagueId/afdeling/$divisionId" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: div } = useQuery({
    queryKey: ["division", divisionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("divisions").select("*").eq("id", divisionId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: league } = useQuery({
    queryKey: ["league", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: signups } = useQuery({
    queryKey: ["league-signups", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id,user_id,driver_name,car_class,driver_category,car_number,waitlist,created_at")
        .eq("league_id", leagueId)
        .is("division_id", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const signupUserIds = (signups ?? []).map((s) => s.user_id);
  const { data: approvedSet } = useQuery({
    queryKey: ["approved-profiles", signupUserIds.sort().join(",")],
    enabled: signupUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, approved")
        .in("id", signupUserIds);
      if (error) throw error;
      return new Set((data ?? []).filter((p) => p.approved).map((p) => p.id));
    },
  });

  // Public list (no reason) — visible to everyone
  const { data: absences } = useQuery({
    queryKey: ["division-absences", divisionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("division_absences_public")
        .select("id,user_id,created_at")
        .eq("division_id", divisionId);
      if (error) throw error;
      return (data ?? []) as { id: string; user_id: string; created_at: string }[];
    },
  });

  // Reasons — only owner/admin rows are returned by RLS
  const { data: absenceReasons } = useQuery({
    queryKey: ["division-absence-reasons", divisionId, user?.id ?? "anon"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("division_absences")
        .select("id,user_id,reason")
        .eq("division_id", divisionId)
        .not("reason", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile-approved", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("approved")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { approved: boolean | null } | null;
    },
  });
  const isApproved = !!myProfile?.approved;

  const { data: lobby } = useQuery({
    queryKey: ["division-lobby", divisionId, user?.id ?? "anon"],
    enabled: !!user && isApproved,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("division_lobbies")
        .select("lobby_code,lobby_password")
        .eq("division_id", divisionId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { lobby_code: string | null; lobby_password: string | null } | null;
    },
  });

  const { data: results } = useQuery({
    queryKey: ["division-results", divisionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_results")
        .select("id,user_id,car_class,car_model,position,points,best_lap_ms,session_type")
        .eq("division_id", divisionId)
        .order("session_type", { ascending: true })
        .order("car_class", { ascending: true })
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const resultUserIds = Array.from(new Set((results ?? []).map((r) => r.user_id)));
  const { data: resultNames } = useQuery({
    queryKey: ["result-driver-names", resultUserIds.sort().join(",")],
    enabled: resultUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, lmu_name")
        .in("id", resultUserIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const p of data ?? []) map.set(p.id, p.display_name || p.lmu_name || "Ukendt kører");
      return map;
    },
  });

  // Division-level entries (reserves who accepted for THIS division only)
  const { data: reserveEntries } = useQuery({
    queryKey: ["division-reserves", divisionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id,user_id,driver_name,car_class,driver_category,car_number,created_at")
        .eq("division_id", divisionId);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; user_id: string; driver_name: string;
        car_class: string; driver_category: string; car_number: number | null; created_at: string;
      }>;
    },
  });

  // My pending reserve offer for this division
  const { data: myOffer } = useQuery({
    queryKey: ["my-reserve-offer", divisionId, user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("division_reserve_offers")
        .select("id,car_class,driver_category,expires_at,status,absentee_user_id")
        .eq("division_id", divisionId)
        .eq("offered_user_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const absenceByUser = new Map((absences ?? []).map((a) => [a.user_id, a]));
  const reasonByUser = new Map((absenceReasons ?? []).map((a) => [a.user_id, a.reason]));
  const myAbsence = user ? absenceByUser.get(user.id) : undefined;
  const mySignup = (signups ?? []).find((e) => e.user_id === user?.id);
  const reserveUserIds = new Set((reserveEntries ?? []).map((r) => r.user_id));

  const configs: ClassConfig[] = Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];
  const keys = configs.length
    ? configs.map((c) => `${c.car_class} · ${c.driver_category}`)
    : Array.from(new Set((signups ?? []).map((e) => `${e.car_class} · ${e.driver_category}`)));

  const grouped: Record<string, any[]> = {};
  for (const k of keys) grouped[k] = [];
  // League-level entries first
  for (const e of signups ?? []) {
    const k = `${e.car_class} · ${e.driver_category}`;
    (grouped[k] ??= []).push({ ...e, _kind: "league" });
  }
  // Reserve entries appended in their class/cat group
  for (const r of reserveEntries ?? []) {
    const k = `${r.car_class} · ${r.driver_category}`;
    (grouped[k] ??= []).push({ ...r, waitlist: false, _kind: "reserve" });
  }

  const triggerReserve = useServerFn(triggerReserveOfferForAbsence);
  const cancelReserve = useServerFn(cancelReserveOffersForAbsence);
  const respondOffer = useServerFn(respondReserveOffer);

  const removeAbsence = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("division_absences").delete().eq("id", id);
      if (error) throw error;
      try { await cancelReserve({ data: { divisionId } }); } catch (e) { console.error(e); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["division-absences", divisionId] });
      qc.invalidateQueries({ queryKey: ["division-reserves", divisionId] });
      toast.success("Markeret som deltager igen");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const offerResponse = useMutation({
    mutationFn: async (vars: { accept: boolean }) => {
      if (!myOffer) throw new Error("Intet aktivt tilbud");
      return await respondOffer({ data: { offerId: myOffer.id, accept: vars.accept } });
    },
    onSuccess: (_res, vars) => {
      toast.success(vars.accept ? "Du er på griddet til denne afdeling" : "Tilbud afslået");
      qc.invalidateQueries({ queryKey: ["my-reserve-offer", divisionId] });
      qc.invalidateQueries({ queryKey: ["division-reserves", divisionId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalSignups = signups?.length ?? 0;
  const absentCount = absences?.length ?? 0;
  const participantCount = totalSignups - absentCount;

  return (
    <div className="space-y-8">
      <Link to="/ligaer/$leagueId" params={{ leagueId }} className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tilbage
      </Link>

      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Afdeling</p>
          <h1 className="text-2xl font-bold tracking-tight">{div?.name}</h1>
          {league?.name && <p className="text-sm text-muted-foreground">{league.name}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {div?.track && <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" />{div.track}{div.layout ? ` · ${div.layout}` : ""}</Badge>}
          {div?.race_date && <Badge variant="outline" className="gap-1"><Calendar className="h-3 w-3" />{format(new Date(div.race_date), "dd MMM yyyy HH:mm")}</Badge>}
          {(div?.settings as any)?.event_settings?.race_minutes != null && (
            <Badge variant="outline" className="gap-1"><Timer className="h-3 w-3" /> {(div!.settings as any).event_settings.race_minutes} min</Badge>
          )}
          {(div?.settings as any)?.temperature != null && (
            <Badge variant="outline" className="gap-1">{(div!.settings as any).temperature}°C</Badge>
          )}
        </div>
      </header>

      {user && (league as any)?.briefing_required !== false && (
        <ClientOnly fallback={null}>
          <Suspense fallback={null}>
            <DriversBriefing
              divisionId={divisionId}
              raceDate={(div?.race_date as string | null | undefined) ?? null}
              briefingOpenMinutesBefore={
                ((div?.settings as any)?.event_settings?.briefing_open_minutes_before as number | undefined) ?? 30
              }
            />
          </Suspense>
        </ClientOnly>
      )}

      {Array.isArray((div?.settings as any)?.weather) && (div!.settings as any).weather.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Vejr</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {((div!.settings as any).weather as WeatherKey[]).map((key, i) => {
                const w = WEATHER_BY_KEY[key];
                if (!w) return null;
                const Icon = w.icon;
                return (
                  <span key={i} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs">
                    <span className="text-muted-foreground">Slot {i + 1}</span>
                    <Icon className="h-4 w-4" /> {w.label}
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <EventSettingsCard settings={((div?.settings as any)?.event_settings ?? {}) as EventSettings} />

      {(() => {
        const hasLobby = !!(lobby?.lobby_code || lobby?.lobby_password);
        if (!user || !mySignup) return null;
        if (!isApproved) {
          return (
            <Card className="border-dashed">
              <CardContent className="flex items-start gap-2 py-4 text-sm text-muted-foreground">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Lobby code og password vises når din profil er godkendt af en admin.</span>
              </CardContent>
            </Card>
          );
        }
        if (!hasLobby) return null;
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> Lobby info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lobby?.lobby_code && (
                <div className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Lobby code</span>
                  <span className="font-mono font-semibold">{lobby.lobby_code}</span>
                </div>
              )}
              {lobby?.lobby_password && (
                <div className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Password</span>
                  <span className="font-mono font-semibold">{lobby.lobby_password}</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}


      {user && myOffer && (
        <Card className="border-amber-500/60 bg-amber-500/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" /> Reserveplads tilbudt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Du er tilbudt en reserveplads til denne afdeling i {myOffer.car_class} · {myOffer.driver_category}.
              Pladsen gælder <strong>kun denne ene afdeling</strong> — bagefter er du tilbage på ventelisten med din nuværende plads i køen.
            </p>
            <p className="text-xs text-muted-foreground">
              Udløber {formatDistanceToNow(new Date(myOffer.expires_at), { addSuffix: true, locale: da })}.
              Hvis du afslår eller ikke svarer, går tilbuddet videre til den næste på ventelisten.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={offerResponse.isPending} onClick={() => offerResponse.mutate({ accept: true })}>
                <UserCheck className="h-4 w-4 mr-1" /> Accepter
              </Button>
              <Button size="sm" variant="outline" disabled={offerResponse.isPending} onClick={() => offerResponse.mutate({ accept: false })}>
                Afslå
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {(results?.length ?? 0) > 0 && (
          <Button
            variant="secondary"
            className="gap-1"
            onClick={() => document.getElementById("resultater")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <Trophy className="h-4 w-4" /> Se resultater
          </Button>
        )}
        {!user && (
          <Button onClick={() => navigate({ to: "/login" })}>Log ind</Button>
        )}
        {user && !mySignup && (
          <p className="text-sm text-muted-foreground">Du er ikke tilmeldt ligaen. Tilmeld dig på ligasiden for at deltage.</p>
        )}
        {user && mySignup && !myAbsence && (
          <AbsenceDialog divisionId={divisionId} userId={user.id} />
        )}
        {user && myAbsence && (
          <Button variant="outline" className="gap-1" onClick={() => removeAbsence.mutate(myAbsence.id)}>
            <UserCheck className="h-4 w-4" /> Jeg deltager alligevel
          </Button>
        )}
        {user && <ProtestDialog leagueId={leagueId} divisionId={divisionId} entries={signups ?? []} currentUserId={user.id} ticketsPerSeason={(league as any)?.protest_tickets_per_season ?? 3} />}
      </div>

      {(results?.length ?? 0) > 0 && (() => {
        const sessions: { type: "race" | "qualifying"; label: string }[] = [
          { type: "race", label: "Race resultater" },
          { type: "qualifying", label: "Kvalifikation" },
        ];
        return (
          <section id="resultater" className="space-y-4 scroll-mt-24">

            {sessions.map(({ type, label }) => {
              const rows = (results ?? []).filter((r) => r.session_type === type);
              if (rows.length === 0) return null;
              const byClass = new Map<string, typeof rows>();
              for (const r of rows) {
                if (!byClass.has(r.car_class)) byClass.set(r.car_class, [] as any);
                byClass.get(r.car_class)!.push(r);
              }
              return (
                <div key={type} className="space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Trophy className="h-4 w-4" />
                    <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</h2>
                  </div>
                  {Array.from(byClass.entries()).map(([cls, list]) => (
                    <Card key={cls}>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">{cls}</CardTitle></CardHeader>
                      <CardContent className="pt-0">
                        <ul className="divide-y divide-border">
                          {list.sort((a, b) => (a.position ?? 999) - (b.position ?? 999)).map((r) => (
                            <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                              <span className="inline-flex h-7 min-w-9 items-center justify-center rounded bg-muted px-2 font-mono text-xs font-semibold tabular-nums">
                                P{r.position}
                              </span>
                              <DriverLink userId={r.user_id} name={resultNames?.get(r.user_id) ?? "Ukendt"} className="flex-1 truncate" />
                              {r.car_model && <span className="hidden sm:inline text-xs text-muted-foreground truncate">{r.car_model}</span>}
                              {r.best_lap_ms != null && (
                                <span className="font-mono text-xs tabular-nums text-muted-foreground">{msToLapStr(r.best_lap_ms)}</span>
                              )}
                              {type === "race" && (
                                <span className="font-mono text-xs tabular-nums font-semibold w-10 text-right">{r.points ?? 0}p</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })}
          </section>
        );
      })()}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Users className="h-4 w-4" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">
              Deltagere ({participantCount}/{totalSignups})
            </h2>
          </div>
          {absentCount > 0 && (
            <span className="text-xs text-muted-foreground">{absentCount} deltager ikke</span>
          )}
        </div>
        {totalSignups === 0 && <p className="text-sm text-muted-foreground">Ingen tilmeldte til ligaen endnu.</p>}
        <div className="space-y-3">
          {Object.entries(grouped).map(([k, list]) => {
            if (!list || list.length === 0) return null;
            const [cls, cat] = k.split(" · ");
            const sorted = [...list].sort((a, b) => (a.car_number ?? 0) - (b.car_number ?? 0));
            return (
              <Card key={k}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span>{cls}</span>
                    <Badge variant="outline" className="text-[10px]">{cat}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="divide-y divide-border">
                    {sorted.map((e) => {
                      const ab = absenceByUser.get(e.user_id);
                      return (
                        <li key={e.id} className={`flex items-center gap-3 py-2 text-sm ${ab ? "opacity-60" : ""}`}>
                          <span className="inline-flex h-7 min-w-9 items-center justify-center rounded bg-muted px-2 font-mono text-xs font-semibold tabular-nums">
                            #{e.car_number}
                          </span>
                          <DriverLink userId={e.user_id} name={e.driver_name} className={`flex-1 truncate ${ab ? "line-through" : ""}`} />
                          {approvedSet?.has(e.user_id) && (
                            <Badge variant="secondary" className="gap-1 text-[10px] text-green-700 dark:text-green-400" title="Godkendt kører">
                              <CheckCircle2 className="h-3 w-3" /> Godkendt
                            </Badge>
                          )}
                          {e.waitlist && <Badge variant="outline" className="text-[10px]">Venteliste</Badge>}
                          {e._kind === "reserve" && (
                            <Badge variant="secondary" className="gap-1 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" title="Reserve — kører kun denne afdeling">
                              Reserve
                            </Badge>
                          )}
                          {ab && (
                            <Badge variant="secondary" className="gap-1 text-[10px]" title={reasonByUser.get(e.user_id) ?? undefined}>
                              <UserX className="h-3 w-3" /> Deltager ikke
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {(absenceReasons?.length ?? 0) > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Begrundelser</h3>
            <ul className="space-y-1.5">
              {(absenceReasons ?? []).map((a) => {
                const e = (signups ?? []).find((s) => s.user_id === a.user_id);
                return (
                  <li key={a.id} className="rounded border border-border px-3 py-2 text-sm">
                    <DriverLink userId={e?.user_id} name={e?.driver_name ?? "Ukendt kører"} className="font-medium" />:{" "}
                    <span className="text-muted-foreground">{a.reason}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function AbsenceDialog({ divisionId, userId }: { divisionId: string; userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const trigger = useServerFn(triggerReserveOfferForAbsence);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("division_absences").insert({
      division_id: divisionId,
      user_id: userId,
      reason: reason.trim() || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Markeret som ikke-deltagende — leder efter reserve");
      setOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["division-absences", divisionId] });
      try {
        const res = await trigger({ data: { divisionId } });
        if (res.ok) toast.success("En reserve er blevet tilbudt pladsen");
      } catch (err) {
        console.error("trigger reserve failed", err);
      }
      qc.invalidateQueries({ queryKey: ["division-reserves", divisionId] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1"><UserX className="h-4 w-4" /> Deltager ikke</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Marker som ikke-deltagende</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Begrundelse (valgfri)</Label>
            <Textarea
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Fx ferie, sygdom, andet løb…"
            />
          </div>
          <DialogFooter>
            <Button type="submit">Bekræft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type EntryLite = { id: string; user_id: string; driver_name: string };

function ProtestDialog({ leagueId, divisionId, entries, currentUserId, ticketsPerSeason }: { leagueId: string; divisionId: string; entries: EntryLite[]; currentUserId: string; ticketsPerSeason: number }) {
  const [open, setOpen] = useState(false);
  const [lap, setLap] = useState("");
  const [corner, setCorner] = useState("");
  const [involved, setInvolved] = useState<string[]>([""]);
  const [desc, setDesc] = useState("");
  const [video, setVideo] = useState("");

  // Tally how many tickets the user has used in this league.
  // A ticket is "spent" when a protest the user submitted has been ruled with
  // outcome 'no_penalty' (i.e. ikke medhold).
  const { data: usedTickets = 0 } = useQuery({
    enabled: !!currentUserId && !!leagueId,
    queryKey: ["protest-tickets-used", leagueId, currentUserId],
    queryFn: async () => {
      const { data: divs } = await supabase
        .from("divisions")
        .select("id")
        .eq("league_id", leagueId);
      const divIds = (divs ?? []).map((d) => d.id);
      if (divIds.length === 0) return 0;
      const { count } = await supabase
        .from("protests")
        .select("id", { count: "exact", head: true })
        .eq("submitted_by", currentUserId)
        .eq("status", "ruled")
        .eq("verdict_outcome", "no_penalty")
        .in("division_id", divIds);
      return count ?? 0;
    },
  });
  const ticketsRemaining = Math.max(0, ticketsPerSeason - usedTickets);
  const outOfTickets = ticketsRemaining <= 0;


  const eligible = entries.filter((e) => e.user_id !== currentUserId);

  const updateDriver = (idx: number, val: string) => {
    setInvolved((arr) => arr.map((v, i) => (i === idx ? val : v)));
  };
  const addDriver = () => setInvolved((arr) => [...arr, ""]);
  const removeDriver = (idx: number) =>
    setInvolved((arr) => (arr.length === 1 ? [""] : arr.filter((_, i) => i !== idx)));

  const reset = () => {
    setLap(""); setCorner(""); setInvolved([""]); setDesc(""); setVideo("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (outOfTickets) { toast.error("Du har ingen protest-billetter tilbage i denne liga"); return; }
    if (video && !/^https?:\/\//i.test(video)) { toast.error("Video link skal være en gyldig URL"); return; }


    // Dedupe selected user IDs
    const userIds = Array.from(new Set(involved.filter(Boolean)));
    if (userIds.length === 0) { toast.error("Vælg mindst én indklaget kører"); return; }

    const selectedEntries = eligible.filter((e) => userIds.includes(e.user_id));
    const names = selectedEntries.map((e) => e.driver_name);

    const { data: created, error } = await supabase
      .from("protests")
      .insert({
        division_id: divisionId,
        submitted_by: currentUserId,
        lap_number: lap ? Number(lap) : null,
        corner: corner.trim() || null,
        involved_drivers: names.join(", "),
        description: desc.trim(),
        video_url: video.trim() || null,
      })
      .select("id")
      .single();

    if (error || !created) { toast.error(error?.message ?? "Kunne ikke oprette protest"); return; }

    const rows = selectedEntries.map((en) => ({
      protest_id: created.id, user_id: en.user_id, driver_name: en.driver_name,
    }));
    const { error: invErr } = await supabase.from("protest_involved").insert(rows);
    if (invErr) { toast.error(`Protest oprettet, men kørere kunne ikke kobles: ${invErr.message}`); return; }

    try {
      const { notifyProtestInvolved } = await import("@/lib/protest-notify.functions");
      await notifyProtestInvolved({ data: { protestId: created.id } });
    } catch (e) {
      console.error("notifyProtestInvolved failed", e);
    }

    toast.success("Protest indsendt – indklagede har fået besked");
    setOpen(false); reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="gap-1"><MessageSquareWarning className="h-4 w-4" /> Indsend protest</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Indsend protest</DialogTitle></DialogHeader>
        <div className={`rounded-md border p-3 text-xs ${outOfTickets ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-muted-foreground"}`}>
          <p className="font-medium text-foreground">Du har {ticketsRemaining} af {ticketsPerSeason} protest-billetter tilbage i denne liga.</p>
          <p className="mt-1">Får du <span className="font-medium text-foreground">medhold</span>, koster det <span className="font-medium text-foreground">ingen billet</span>. Får du <span className="font-medium text-foreground">ikke medhold</span>, koster det <span className="font-medium text-foreground">1 billet</span>.</p>
          {outOfTickets && <p className="mt-1 font-medium">Du kan ikke indsende flere protests i denne liga.</p>}
        </div>
        <form onSubmit={submit} className="space-y-3">

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Omgang</Label><Input type="number" min={1} value={lap} onChange={(e) => setLap(e.target.value)} /></div>
            <div><Label>Sving</Label><Input maxLength={50} value={corner} onChange={(e) => setCorner(e.target.value)} placeholder="fx T7" /></div>
          </div>
          <div className="space-y-2">
            <Label>Involverede kørere</Label>
            {eligible.length === 0 && (
              <p className="text-xs text-muted-foreground">Ingen andre tilmeldte kørere i ligaen.</p>
            )}
            {involved.map((v, i) => {
              const otherSelected = involved.filter((_, idx) => idx !== i);
              const options = eligible.filter((e) => !otherSelected.includes(e.user_id));
              return (
                <div key={i} className="flex gap-2">
                  <Select value={v} onValueChange={(val) => updateDriver(i, val)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={`Vælg kører ${i + 1}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((e) => (
                        <SelectItem key={e.user_id} value={e.user_id}>{e.driver_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(involved.length > 1 || v) && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeDriver(i)} className="shrink-0">
                      Fjern
                    </Button>
                  )}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addDriver} disabled={involved.length >= eligible.length}>
              + Tilføj kører
            </Button>
          </div>
          <div><Label>Beskrivelse</Label><Textarea required maxLength={2000} value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} /></div>
          <div><Label>Video-link (valgfri)</Label><Input type="url" maxLength={500} value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://…" /></div>
          <DialogFooter><Button type="submit" disabled={outOfTickets}>Send</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EventSettingsCard({ settings }: { settings: EventSettings }) {
  const rows = EVENT_NUMERIC_FIELDS
    .map((f) => {
      const v = settings[f.key] as number | undefined;
      return v == null || Number.isNaN(v) ? null : { label: f.label, value: `${v}${f.suffix ? ` ${f.suffix}` : ""}` };
    })
    .filter(Boolean) as { label: string; value: string }[];
  if (settings.in_game_time) rows.push({ label: "In-game tid", value: settings.in_game_time });

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Event settings</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border first:border-t-0">
                <td className="py-1.5 pr-2 text-muted-foreground">{r.label}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
