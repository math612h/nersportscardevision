import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/privatlivspolitik")({
  head: () => ({
    meta: [
      { title: "Privatlivspolitik – LMU Danmark" },
      {
        name: "description",
        content:
          "Sådan behandler LMU Danmark dine personoplysninger: hvilke data vi gemmer, hvorfor, hvor længe, og hvordan du får indsigt eller får dem slettet.",
      },
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Privatlivspolitik</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Senest opdateret: 22. juni 2026. Denne side beskriver, hvilke personoplysninger
          LMU Danmark indsamler, hvorfor vi gør det, hvor længe vi opbevarer dem, og
          hvilke rettigheder du har som bruger.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hvem er dataansvarlig?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            LMU Danmark er en hobby-baseret sim racing-liga. Hvis du har spørgsmål til
            behandlingen af dine personoplysninger eller ønsker at udøve dine
            rettigheder, kan du kontakte os via Discord eller den email-adresse, der
            er anført på vores Discord-server.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hvilke oplysninger indsamler vi?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <div>
            <p className="font-medium text-foreground">Profiloplysninger</p>
            <p>Navn, LMU-navn, email, Discord-brugernavn, valgfri alder, bio og achievements.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Adresse (valgfri)</p>
            <p>
              Vej, postnummer, by og land. Bruges <span className="font-medium text-foreground">kun</span>,
              hvis du vinder en præmie og vi skal sende den til dig. Det er helt valgfrit at
              udfylde adressen, og du kan deltage i ligaen uden at oplyse den.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Race-data</p>
            <p>Omgangstider, resultater, tilmeldinger, ratings og lignende ligadata.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Teknisk data</p>
            <p>Login-sessioner, push-notifikations-tokens og audit-log over admin-handlinger.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Formål og retsgrundlag</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="text-foreground font-medium">Drift af ligaen</span> (kontrakt / berettiget interesse) — navn, LMU-navn, email og race-data.</li>
            <li><span className="text-foreground font-medium">Udsendelse af præmier</span> (samtykke) — din adresse. Du giver aktivt samtykke, når du udfylder adressen.</li>
            <li><span className="text-foreground font-medium">Sikkerhed og misbrugskontrol</span> (berettiget interesse) — audit-log, login-data.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hvor længe opbevarer vi dine oplysninger?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-foreground font-medium">Adresse</span>: slettes automatisk,
              hvis din konto har været inaktiv (ingen login) i mere end <span className="font-medium text-foreground">1 år</span>.
              Du kan også til enhver tid selv fjerne den under "Min profil".
            </li>
            <li>
              <span className="text-foreground font-medium">Profil og race-data</span>: opbevares så længe din konto eksisterer.
            </li>
            <li>
              <span className="text-foreground font-medium">Audit-log</span>: opbevares af sikkerhedsmæssige hensyn så længe det er nødvendigt.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dine rettigheder</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>I henhold til GDPR har du ret til:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="text-foreground font-medium">Indsigt</span> — at få at vide hvilke oplysninger vi har om dig.</li>
            <li><span className="text-foreground font-medium">Berigtigelse</span> — at få rettet forkerte oplysninger (direkte under "Min profil").</li>
            <li><span className="text-foreground font-medium">Sletning</span> — at få slettet din konto og alle tilknyttede data. Du kan slette din konto direkte under <Link to="/profil" className="underline text-foreground">Min profil → Slet konto</Link>.</li>
            <li><span className="text-foreground font-medium">Tilbagekaldelse af samtykke</span> — du kan til enhver tid fjerne din adresse under Min profil.</li>
            <li><span className="text-foreground font-medium">Klage</span> — du kan klage til Datatilsynet (datatilsynet.dk).</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Databehandlere</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Vi anvender følgende databehandlere til at drive platformen:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="text-foreground font-medium">Lovable Cloud / Supabase</span> — hosting af database, login og fillager.</li>
            <li><span className="text-foreground font-medium">Discord</span> — login og kommunikation.</li>
            <li><span className="text-foreground font-medium">Cloudflare</span> — hosting af selve sitet.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sletning af konto</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Du kan til enhver tid selv slette din konto. Når du sletter din konto, fjernes
            samtidig alle tilknyttede data — profil, adresse, race-resultater, ratings,
            tilmeldinger osv. — permanent og uigenkaldeligt.
          </p>
          <p>
            Gå til <Link to="/profil" className="underline text-foreground">Min profil</Link> og brug knappen "Slet min konto" nederst på siden.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
