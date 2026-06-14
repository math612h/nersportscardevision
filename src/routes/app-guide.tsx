import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Smartphone, Share, Plus, SquarePlus, MoreVertical, Apple, MonitorSmartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/app-guide")({
  component: AppGuidePage,
});

function AppGuidePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Tilbage til forsiden
      </Link>

      <header className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Smartphone className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">App-guide</h1>
        <p className="text-sm text-muted-foreground">
          Føj LMU Danmark til din startskærm, så den virker som en rigtig app.
        </p>
      </header>

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-primary">
              <Apple className="h-5 w-5" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">iPhone & iPad (iOS)</h2>
            </div>
            <ol className="space-y-3 text-sm text-foreground/90">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">1</span>
                <span>Åbn Safari og gå til <strong>lmudanmark.dk</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">2</span>
                <span>Tryk på <Share className="mx-1 inline h-4 w-4 text-primary" />-ikonet nederst på skærmen</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">3</span>
                <span>Rul ned og tryk på <strong>"Føj til hjem"</strong> <SquarePlus className="mx-1 inline h-4 w-4 text-primary" /></span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">4</span>
                <span>Tryk <strong>"Tilføj"</strong> øverst til højre — ikonet lander på din startskærm</span>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-primary">
              <MonitorSmartphone className="h-5 w-5" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Android (Chrome)</h2>
            </div>
            <ol className="space-y-3 text-sm text-foreground/90">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">1</span>
                <span>Åbn Chrome og gå til <strong>lmudanmark.dk</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">2</span>
                <span>Tryk på <MoreVertical className="mx-1 inline h-4 w-4 text-primary" />-menuen øverst til højre</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">3</span>
                <span>Vælg <strong>"Installer app"</strong> eller <strong>"Føj til startskærm"</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">4</span>
                <span>Bekræft — ikonet lander på din startskærm som en app</span>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Hvad får du?</h2>
            <ul className="space-y-2 text-sm text-foreground/90">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Hurtig adgang med ét tryk fra startskærmen
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Fuldskærmsvis uden browser-kanter (som en rigtig app)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                LMU Danmark-logo på ikonet
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
