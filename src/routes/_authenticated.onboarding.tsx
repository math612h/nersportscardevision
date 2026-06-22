import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Flag, Loader2, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { completeOnboarding } from "@/lib/onboarding.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Færdiggør din profil – LMU Danmark" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const finish = useServerFn(completeOnboarding);

  const { data: state, isLoading } = useQuery({
    queryKey: ["onboarding-data", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: profile }, { data: priv }] = await Promise.all([
        supabase.from("profiles").select("display_name, lmu_name, accepts_danish, media_consent").eq("id", user!.id).maybeSingle(),
        (supabase as unknown as { from: (t: string) => any }).from("profiles_private")
          .select("discord_user_id, discord_username, discord_server_nickname, address, postal_code, city, country").eq("user_id", user!.id).maybeSingle(),
      ]);
      return {
        display_name: (profile as any)?.display_name ?? "",
        lmu_name: (profile as any)?.lmu_name ?? "",
        accepts_danish: (profile as any)?.accepts_danish === true,
        media_consent: (profile as any)?.media_consent === true,
        discord_user_id: (priv as any)?.discord_user_id ?? null,
        discord_username: (priv as any)?.discord_username ?? null,
        discord_server_nickname: (priv as any)?.discord_server_nickname ?? null,
        address: (priv as any)?.address ?? "",
        postal_code: (priv as any)?.postal_code ?? "",
        city: (priv as any)?.city ?? "",
        country: (priv as any)?.country ?? "Danmark",
      };
    },
  });

  const [displayName, setDisplayName] = useState("");
  const [lmuName, setLmuName] = useState("");
  const [email, setEmail] = useState("");
  const [acceptsDanish, setAcceptsDanish] = useState(false);
  const [mediaConsent, setMediaConsent] = useState(false);
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Danmark");
  const [addressConsent, setAddressConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setDisplayName(state.discord_server_nickname || state.display_name || "");
    setLmuName(state.lmu_name || "");
    setEmail((user?.email && !user.email.endsWith("@no-email.lmudanmark.dk")) ? user.email : "");
    setAcceptsDanish(!!state.accepts_danish);
    setMediaConsent(!!state.media_consent);
    setAddress(state.address || "");
    setPostalCode(state.postal_code || "");
    setCity(state.city || "");
    setCountry(state.country || "Danmark");
  }, [state, user]);


  const hasServerNickname = !!state?.discord_server_nickname;

  const discordLinked = !!state?.discord_user_id;

  const onLinkDiscord = () => {
    window.location.href = "/api/public/discord/login";
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return toast.error("Sæt dit navn via #velkomst på Discord først.");
    if (!/\S+\s+\S+/.test(displayName.trim())) {
      return toast.error("Dit Discord-servernavn skal indeholde både for- og efternavn.");
    }
    if (!lmuName.trim()) return toast.error("Indtast dit LMU-navn.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Indtast en gyldig email.");
    const hasAnyAddress = !!(address.trim() || postalCode.trim() || city.trim());
    if (hasAnyAddress) {
      if (!address.trim() || !postalCode.trim() || !city.trim()) {
        return toast.error("Hvis du udfylder adresse, skal vej, postnummer og by alle udfyldes.");
      }
      if (!addressConsent) {
        return toast.error("Du skal give samtykke til opbevaring af din adresse.");
      }
    }
    if (!acceptsDanish) return toast.error("Bekræft venligst at du kan læse og skrive dansk.");
    if (!mediaConsent) return toast.error("Du skal acceptere brug af navn/billeder på stream og SoMe.");
    setSaving(true);
    try {
      await finish({ data: {
        display_name: displayName.trim(),
        lmu_name: lmuName.trim(),
        email: email.trim(),
        accepts_danish: acceptsDanish,
        media_consent: mediaConsent,
        address: address.trim(),
        postal_code: postalCode.trim(),
        city: city.trim(),
        country: country.trim() || "Danmark",
        address_consent: addressConsent,
      } });
      toast.success("Profil gemt.");
      await qc.invalidateQueries({ queryKey: ["onboarding-status", user?.id] });
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke gemme profil.");
    } finally {
      setSaving(false);
    }
  };


  if (isLoading) {
    return <div className="mx-auto max-w-xl px-4 py-10 text-muted-foreground">Indlæser…</div>;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Flag className="h-6 w-6" />
          </div>
          <CardTitle>Færdiggør din profil</CardTitle>
          <CardDescription>
            For at bruge LMU Danmark skal du tilknytte Discord og udfylde dit visningsnavn, LMU-navn og email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!discordLinked ? (
            <div className="space-y-3 rounded-md border border-dashed border-border p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Du skal først tilknytte din Discord-konto.
              </p>
              <Button onClick={onLinkDiscord} className="gap-2">
                <Link2 className="h-4 w-4" /> Tilknyt Discord
              </Button>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Discord:</span>{" "}
              <span className="font-medium">{state?.discord_username}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label>Profilnavn (fulde navn)</Label>
              <Input
                value={displayName}
                readOnly
                disabled
                placeholder={hasServerNickname ? "" : "Sæt dit navn via #velkomst på Discord"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Dit profilnavn er <span className="font-medium text-foreground">låst og synkroniseres automatisk fra dit Discord-servernavn</span> på LMU Danmark-serveren. Skift dit navn via knappen <span className="font-medium text-foreground">"Skriv dit navn"</span> i #velkomst-kanalen — så opdateres det her med det samme.
              </p>
            </div>
            {!hasServerNickname && discordLinked ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-medium text-foreground">Du mangler at sætte dit navn på Discord</p>
                <p className="mt-1 text-muted-foreground">
                  Gå til <span className="font-medium text-foreground">#velkomst</span> på LMU Danmark-Discord-serveren, klik på <span className="font-medium text-foreground">"Skriv dit navn"</span> og udfyld dit fornavn og efternavn. Kom derefter tilbage hertil og genindlæs siden.
                </p>
              </div>
            ) : null}
            <div>
              <Label>LMU-navn</Label>
              <Input value={lmuName} onChange={(e) => setLmuName(e.target.value)} maxLength={80} required disabled={!discordLinked}
                placeholder='Som det står i Le Mans Ultimate under "Profile"' />
              <p className="mt-1 text-xs text-muted-foreground">
                Skal stå <span className="font-medium text-foreground">100% som det står i Le Mans Ultimate under "Profile"</span> — inklusive store/små bogstaver og mellemrum. Bruges til at koble løbsresultater til din konto.
              </p>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required disabled={!discordLinked} />
              <p className="mt-1 text-xs text-muted-foreground">Bruges til notifikationer. Forudfyldt fra Discord — du kan ændre den.</p>
            </div>
            <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 cursor-pointer">
              <Checkbox
                checked={acceptsDanish}
                onCheckedChange={(v) => setAcceptsDanish(v === true)}
                disabled={!discordLinked}
                className="mt-0.5"
              />
              <span className="text-sm">
                Jeg bekræfter, at jeg kan <span className="font-medium">læse og skrive dansk</span>. Al kommunikation i ligaen — inkl. drivers briefings, regler og protester — foregår på dansk.
              </span>
            </label>
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium">Adresse <span className="text-xs font-normal text-muted-foreground">(valgfri)</span></p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Helt valgfri. Bruges <span className="font-medium text-foreground">kun</span> hvis du vinder en præmie og vi skal sende den til dig.
                  Skjult for andre brugere, slettes automatisk hvis din konto er inaktiv i mere end 1 år, og du kan til enhver tid fjerne den igen.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Adresse</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} disabled={!discordLinked} placeholder="Vej og husnummer" />
                </div>
                <div>
                  <Label>Postnummer</Label>
                  <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={20} disabled={!discordLinked} />
                </div>
                <div>
                  <Label>By</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} disabled={!discordLinked} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Land</Label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={100} disabled={!discordLinked} />
                </div>
              </div>
              {(address.trim() || postalCode.trim() || city.trim()) ? (
                <label className="flex items-start gap-2 rounded-md border border-border bg-background p-2 cursor-pointer">
                  <Checkbox
                    checked={addressConsent}
                    onCheckedChange={(v) => setAddressConsent(v === true)}
                    disabled={!discordLinked}
                    className="mt-0.5"
                  />
                  <span className="text-xs">
                    Jeg giver samtykke til, at LMU Danmark må opbevare min adresse mhp. forsendelse af eventuelle præmier. Jeg kan til enhver tid trække samtykket tilbage. Se{" "}
                    <a href="/privatlivspolitik" target="_blank" rel="noreferrer" className="underline font-medium text-foreground">privatlivspolitikken</a>.
                  </span>
                </label>
              ) : null}
            </div>
            <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 cursor-pointer">
              <Checkbox
                checked={acceptsDanish}
                onCheckedChange={(v) => setAcceptsDanish(v === true)}
                disabled={!discordLinked}
                className="mt-0.5"
              />
              <span className="text-sm">
                Jeg bekræfter, at jeg kan <span className="font-medium">læse og skrive dansk</span>. Al kommunikation i ligaen — inkl. drivers briefings, regler og protester — foregår på dansk.
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 cursor-pointer">
              <Checkbox
                checked={mediaConsent}
                onCheckedChange={(v) => setMediaConsent(v === true)}
                disabled={!discordLinked}
                className="mt-0.5"
              />
              <span className="text-sm">
                Jeg giver tilladelse til, at LMU Danmark må <span className="font-medium">anvende mit navn og eventuelle billeder/klip af mig på stream og sociale medier</span> i forbindelse med ligaens aktiviteter.
              </span>
            </label>
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => { void signOut(); navigate({ to: "/login" }); }}>
                Log ud
              </Button>
              <Button type="submit" disabled={saving || !discordLinked}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Gem og fortsæt
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}
