import { createFileRoute } from "@tanstack/react-router";
import { Coffee, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/donationer")({
  head: () => ({
    meta: [
      { title: "Donationer – LMU Danmark" },
      { name: "description", content: "Støt driften af LMU Danmark via MobilePay." },
      { property: "og:title", content: "Donationer – LMU Danmark" },
      { property: "og:description", content: "Alle bidrag hjælper med at holde platformen kørende." },
    ],
  }),
  component: DonationsPage,
});

const MOBILEPAY_BOX = "4412ZQ";

function TierCard({ label, range, color }: { label: string; range: string; color: string }) {
  return (
    <Card className="border-2" style={{ borderColor: color }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base" style={{ color }}>{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{range}</CardContent>
    </Card>
  );
}

function DonationsPage() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(MOBILEPAY_BOX);
    setCopied(true);
    toast.success("MobilePay-boks kopieret");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2 text-center">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Heart className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">Støt LMU Danmark</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Al drift af LMU Danmark betales af egne lommer, og hele fællesskabet holdes kørende af
          frivillige kræfter. Har du lyst til at hjælpe med at dække serverne, domænet og de mange
          timer der lægges i platformen, så er ethvert bidrag varmt modtaget – stort som småt.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>MobilePay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Send dit bidrag til vores MobilePay-boks:
          </p>
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
            <span className="text-2xl font-bold tracking-widest">{MOBILEPAY_BOX}</span>
            <Button size="sm" variant="outline" onClick={copy} className="ml-auto">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-1">{copied ? "Kopieret" : "Kopiér"}</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Skriv gerne dit LMU-navn i beskeden, så vi kan anerkende dig med en farvet kant på dit
            medlemskort.
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Anerkendelse</h2>
        <p className="text-sm text-muted-foreground">
          Som tak tildeler vi donorer en farvet kant, der vises på dit medlemskort overalt på
          hjemmesiden.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <TierCard label="Bronze" range="Op til 250 kr." color="#cd7f32" />
          <TierCard label="Sølv" range="Op til 1.000 kr." color="#c0c0c0" />
          <TierCard label="Guld" range="Over 1.000 kr." color="#ffd700" />
        </div>
        <p className="text-xs text-muted-foreground">
          Farven tildeles manuelt af en admin, når dit bidrag er registreret.
        </p>
      </section>
    </div>
  );
}
