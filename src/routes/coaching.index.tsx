import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Flame, Target, Trophy, UserCog, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COACHING_FOCUS_POINTS } from "@/lib/coaching-focus-points";

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
              <a href="#tilbyder">Vi tilbyder</a>
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
          <div className="mt-10 flex justify-center">
            <Button asChild size="lg">
              <Link to="/coaching/book">
                Book coaching nu <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

    </div>
  );
}

