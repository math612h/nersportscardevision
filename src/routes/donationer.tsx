import { createFileRoute } from "@tanstack/react-router";
import { Coffee, CreditCard } from "lucide-react";
import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { donationBorderClass, type DonationTier } from "@/lib/donation-tier";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { createDonationCheckout } from "@/lib/payments.functions";
import { getStripeEnvironment, hasStripeConfigured } from "@/lib/stripe";
import { StripeEmbeddedCheckoutBox } from "@/components/StripeEmbeddedCheckoutBox";


export const Route = createFileRoute("/donationer")({
  head: () => ({
    meta: [
      { title: "Donationer – LMU Danmark" },
      { name: "description", content: "Støt driften af LMU Danmark med kort eller MobilePay via sikker betaling." },
      { property: "og:title", content: "Donationer – LMU Danmark" },
      { property: "og:description", content: "Alle bidrag hjælper med at holde platformen kørende." },
    ],
  }),
  component: DonationsPage,
});



const TIER_LABEL: Record<Exclude<DonationTier, null>, string> = {
  bronze: "Bronze",
  silver: "Sølv",
  gold: "Guld",
};
const TIER_COLOR: Record<Exclude<DonationTier, null>, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
};

const DEMO_ROWS: Array<{ name: string; tier: DonationTier }> = [
  { name: "Mikkel Rasmussen", tier: "gold" },
  { name: "Jonas Sørensen", tier: null },
  { name: "Anders Kjær", tier: "silver" },
  { name: "Thomas Berg", tier: null },
  { name: "Kasper Lund", tier: "bronze" },
  { name: "Frederik Holm", tier: null },
];

const QUICK_AMOUNTS = [25, 50, 100, 250, 500];

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

function StripeDonation() {
  const { user } = useAuth();
  const checkoutFn = useServerFn(createDonationCheckout);
  const [amount, setAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [checkoutActive, setCheckoutActive] = useState(false);

  const activeAmount = customAmount ? Math.max(0, Math.floor(Number(customAmount) || 0)) : amount;

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const result = await checkoutFn({
      data: {
        amountDkk: activeAmount,
        returnUrl: `${window.location.origin}/donationer?paid=1`,
        environment: getStripeEnvironment(),
      },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Kunne ikke starte betaling");
    return result.clientSecret;
  }, [checkoutFn, activeAmount]);

  const start = () => {
    if (!user) {
      toast.error("Log ind for at donere med kort/MobilePay — så kan vi tildele dig en donor-farve.");
      return;
    }
    if (!hasStripeConfigured()) {
      toast.error("Kort/MobilePay-betaling er ikke aktiveret endnu. Brug MobilePay-boksen ovenfor.");
      return;
    }
    if (activeAmount < 5) {
      toast.error("Minimumbeløb er 5 kr.");
      return;
    }
    setCheckoutActive(true);
  };

  if (!hasStripeConfigured()) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          Betal med kort eller MobilePay
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!checkoutActive && (
          <>
            <div>
              <div className="mb-2 text-sm text-muted-foreground">Vælg et beløb:</div>
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => { setAmount(a); setCustomAmount(""); }}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm",
                      !customAmount && amount === a
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    {a} kr.
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Andet beløb (kr.)</label>
              <Input
                type="number"
                min={5}
                inputMode="numeric"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="fx 75"
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              Du donerer <strong>{activeAmount} kr.</strong> — betalingen registreres automatisk og
              tæller straks med i din donor-status.
            </div>
            <Button className="w-full" size="lg" onClick={start} disabled={activeAmount < 5 || !user}>
              {user ? `Doner ${activeAmount} kr.` : "Log ind for at donere med kort/MobilePay"}
            </Button>
          </>
        )}

        {checkoutActive && (
          <>
            <StripeEmbeddedCheckoutBox fetchClientSecret={fetchClientSecret} />
            <Button variant="ghost" className="w-full" onClick={() => setCheckoutActive(false)}>
              Annullér
            </Button>
          </>
        )}
      </CardContent>
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

  const paid = typeof window !== "undefined" && new URL(window.location.href).searchParams.get("paid") === "1";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2 text-center">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Coffee className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">Køb os en kaffe</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Al drift af LMU Danmark finansieres af frivillige donationer, og hele fællesskabet holdes
          kørende af frivillige kræfter. Har du lyst til at hjælpe med at dække serverne, domænet og
          de mange timer og udgifter der lægges i platformen, så er ethvert bidrag varmt modtaget –
          stort som småt.
        </p>
      </header>

      {paid && (
        <Card className="border-emerald-500/50 bg-emerald-500/10">
          <CardContent className="pt-6 text-center text-sm">
            <div className="text-lg font-semibold text-emerald-500">Tusind tak! 🙏</div>
            <p className="mt-1 text-muted-foreground">
              Din donation er modtaget og din donor-status er opdateret automatisk.
            </p>
          </CardContent>
        </Card>
      )}

      <StripeDonation />

      <Card>
        <CardHeader>
          <CardTitle>MobilePay (manuel)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Foretrækker du at sende direkte til vores MobilePay-boks? Skriv gerne dit LMU-navn i
            beskeden — vi registrerer donationen manuelt bagefter.
          </p>
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
            <span className="text-2xl font-bold tracking-widest">{MOBILEPAY_BOX}</span>
            <Button size="sm" variant="outline" onClick={copy} className="ml-auto">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-1">{copied ? "Kopieret" : "Kopiér"}</span>
            </Button>
          </div>
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
          Farven tildeles automatisk, når dit bidrag er registreret.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sådan ser det ud</h2>
        <p className="text-sm text-muted-foreground">
          Et eksempel på hvordan donorernes kort skiller sig ud i deltager- og resultatlister.
        </p>
        <Card>
          <CardContent className="p-3">
            <ul className="divide-y divide-border">
              {DEMO_ROWS.map((row, idx) => (
                <li
                  key={row.name}
                  className={cn(
                    "flex items-center gap-3 py-2 text-sm",
                    row.tier && donationBorderClass(row.tier),
                    row.tier && "px-3 my-1",
                  )}
                >
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded bg-muted px-2 font-mono text-xs font-semibold tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="flex-1 truncate font-medium">{row.name}</span>
                  {row.tier && (
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: TIER_COLOR[row.tier] }}
                    >
                      {TIER_LABEL[row.tier]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
