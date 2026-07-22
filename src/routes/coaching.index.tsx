import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Flame, Star, Target, Trophy, UserCog, Zap, Trophy as TrophyIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COACHING_FOCUS_POINTS } from "@/lib/coaching-focus-points";
import {
  listCoachesPublic,
  getCoachRatingsSummaries,
  listCoachRatings,
  adminDeleteCoachingRating,
  type CoachListItem,
} from "@/lib/coaching.functions";
import { cn } from "@/lib/utils";

import { useAuth } from "@/hooks/use-auth";




export const Route = createFileRoute("/coaching/")({
  head: () => ({
    meta: [
      { title: "LMU Danmark Coaching — bliv hurtigere og bedre forberedt" },
      { name: "description", content: "Få personlig LMU coaching med fokus på pace, stabilitet, racecraft, multiclass-forståelse og forberedelse til liga- og endurance racing." },
      { property: "og:title", content: "LMU Danmark Coaching" },
      { property: "og:description", content: "Bliv hurtigere, mere stabil og bedre forberedt til race." },
    ],
  }),
  component: CoachingLanding,
});

function CoachingLanding() {
  const { isAdmin, isCoach } = useAuth();
  const coachesFn = useServerFn(listCoachesPublic);
  const summariesFn = useServerFn(getCoachRatingsSummaries);
  const { data: coaches = [] } = useQuery<CoachListItem[]>({
    queryKey: ["coaches-public"],
    queryFn: () => coachesFn(),
  });
  const coachIds = useMemo(() => coaches.map((c) => c.user_id), [coaches]);
  const { data: summaries = {} } = useQuery({
    queryKey: ["coach-rating-summaries", coachIds],
    queryFn: () => summariesFn({ data: { coach_user_ids: coachIds } }),
    enabled: coachIds.length > 0,
  });
  const [detailCoach, setDetailCoach] = useState<CoachListItem | null>(null);


  return (
    <div className="min-h-screen bg-background">
      {(isAdmin || isCoach) && (
        <section className="border-b border-border bg-primary/5">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="flex items-center gap-2 text-sm">
              <UserCog className="h-4 w-4 text-primary" />
              <span className="font-medium">Coach-værktøjer</span>
              <span className="text-muted-foreground">— administrér din profil og kalender</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/coaching/min-profil">Gå til min coach-profil</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/coaching/min-kalender">Min kalender</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.18),transparent_70%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent,hsl(var(--background)))]" />
        <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Flame className="h-3.5 w-3.5" /> LMU Danmark Coaching
          </div>
          <h1 className="text-balance bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
            Bliv hurtigere, mere stabil og bedre forberedt til race
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Få personlig LMU coaching med fokus på pace, stabilitet, racecraft, multiclass-forståelse og forberedelse til liga- og endurance racing.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="shadow-lg shadow-primary/20">
              <Link to="/coaching/book">
                Book coaching <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/coaching/mine-bookinger">Mine bookinger</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <a href="#coaches">Mød coaches</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Why coaching */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Target, title: "Målrettet", desc: "Du vælger hvad du vil have hjælp til. Vi matcher dig med en coach der har det som speciale." },
            { icon: Zap, title: "Konkret", desc: "Ingen fyldord. Vi går direkte til der hvor du taber tid eller mister kontrol." },
            { icon: Trophy, title: "Race-ready", desc: "Coaching der ruster dig til ligaer, endurances og multiclass-trafik." },
          ].map((b, i) => (
            <Card key={i} className="border-border/60 bg-card/40 backdrop-blur">
              <CardContent className="pt-6">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <b.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Focus points */}
      <section id="tilbyder" className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Vi tilbyder coaching i</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Vælg de fokuspunkter du har brug for. Vi anbefaler 1-3 fokuspunkter — jo færre, desto mere dybdegående kan vi gå.
          </p>
          <ul className="mt-8 grid gap-2 sm:grid-cols-2">
            {COACHING_FOCUS_POINTS.map((fp) => (
              <li key={fp} className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{fp}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Coaches */}
      {coaches.length > 0 && (
        <section id="coaches" className="border-t border-border">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-3xl font-bold tracking-tight">Mød vores coaches</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Kig deres profiler igennem og find den coach hvis specialer matcher dine behov.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {coaches.map((c) => {
                const s = (summaries as any)[c.user_id] as { avg: number; count: number } | undefined;
                return (
                  <Card key={c.user_id} className="flex flex-col border-border/60 bg-card/40 backdrop-blur">
                    <CardContent className="flex flex-1 flex-col pt-6">
                      <button
                        type="button"
                        onClick={() => setDetailCoach(c)}
                        className="group flex items-center gap-3 text-left"
                      >
                        <Avatar className="h-14 w-14">
                          {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                          <AvatarFallback>{c.display_name?.[0] ?? "?"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-lg font-semibold group-hover:underline">{c.display_name}</div>
                          <div className="flex items-center gap-1 text-xs">
                            <StarRow value={s?.avg ?? 0} />
                            <span className="ml-1 text-muted-foreground">
                              {s && s.count > 0 ? `${s.avg.toFixed(1)} · ${s.count} ${s.count === 1 ? "bedømmelse" : "bedømmelser"}` : "Ingen bedømmelser endnu"}
                            </span>
                          </div>
                        </div>
                      </button>
                      {c.bio && (
                        <p className="mt-4 line-clamp-4 text-sm text-muted-foreground">{c.bio}</p>
                      )}
                      {c.specialties.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {c.specialties.slice(0, 6).map((sp) => (
                            <Badge key={sp} variant="secondary" className="text-[11px]">{sp}</Badge>
                          ))}
                          {c.specialties.length > 6 && (
                            <Badge variant="outline" className="text-[11px]">+{c.specialties.length - 6}</Badge>
                          )}
                        </div>
                      )}
                      {c.achievements.length > 0 && (
                        <ul className="mt-4 space-y-1.5">
                          {c.achievements.slice(0, 3).map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <TrophyIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto flex gap-2 pt-5">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetailCoach(c)}>
                          Se profil
                        </Button>
                        <Button asChild size="sm" className="flex-1">
                          <Link to="/coaching/book">
                            Book <ArrowRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <div className="mt-10 flex justify-center">
              <Button asChild size="lg">
                <Link to="/coaching/book">
                  Book coaching nu <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      <CoachDetailDialog coach={detailCoach} onOpenChange={(o) => !o && setDetailCoach(null)} summary={detailCoach ? (summaries as any)[detailCoach.user_id] : undefined} />

    </div>
  );
}

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          style={{ width: size, height: size }}
          className={cn(n <= Math.round(value) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30")}
        />
      ))}
    </div>
  );
}

function CoachDetailDialog({
  coach,
  onOpenChange,
  summary,
}: {
  coach: CoachListItem | null;
  onOpenChange: (open: boolean) => void;
  summary?: { avg: number; count: number };
}) {
  const listFn = useServerFn(listCoachRatings);
  const { data: ratings = [], isLoading } = useQuery({
    queryKey: ["coach-ratings", coach?.user_id],
    queryFn: () => listFn({ data: { coach_user_id: coach!.user_id } }),
    enabled: !!coach,
  });

  return (
    <Dialog open={!!coach} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {coach && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  {coach.avatar_url && <AvatarImage src={coach.avatar_url} />}
                  <AvatarFallback>{coach.display_name?.[0] ?? "?"}</AvatarFallback>
                </Avatar>
                <div>
                  <div>{coach.display_name}</div>
                  <div className="flex items-center gap-2 text-xs font-normal">
                    <StarRow value={summary?.avg ?? 0} />
                    <span className="text-muted-foreground">
                      {summary && summary.count > 0 ? `${summary.avg.toFixed(1)} · ${summary.count} ${summary.count === 1 ? "bedømmelse" : "bedømmelser"}` : "Ingen bedømmelser endnu"}
                    </span>
                  </div>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              {coach.bio && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{coach.bio}</p>}

              {coach.specialties.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Specialer</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {coach.specialties.map((s) => (
                      <Badge key={s} variant="secondary" className="text-[11px]">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {coach.achievements.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Achievements</h4>
                  <ul className="space-y-1.5">
                    {coach.achievements.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <TrophyIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h4 className="mb-2 text-sm font-semibold">Bedømmelser</h4>
                {isLoading ? (
                  <p className="text-xs text-muted-foreground">Indlæser…</p>
                ) : ratings.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Der er endnu ikke afgivet bedømmelser for denne coach.</p>
                ) : (
                  <ul className="space-y-3">
                    {ratings.map((r: any) => (
                      <li key={r.id} className="rounded-lg border border-border/60 bg-card/40 p-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            {r.rater_avatar_url && <AvatarImage src={r.rater_avatar_url} />}
                            <AvatarFallback>{r.rater_display_name?.[0] ?? "?"}</AvatarFallback>
                          </Avatar>
                          <div className="text-sm font-medium">{r.rater_display_name}</div>
                          <div className="ml-auto"><StarRow value={r.stars} size={12} /></div>
                        </div>
                        {r.comment && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{r.comment}</p>}
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("da-DK", { day: "2-digit", month: "long", year: "numeric" })}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button asChild>
                  <Link to="/coaching/book">
                    Book hos {coach.display_name.split(" ")[0]} <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

