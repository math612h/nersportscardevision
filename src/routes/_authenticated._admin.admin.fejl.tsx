import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/admin/fejl")({
  component: ErrorCatalog,
});

type ErrorEntry = {
  pattern: string;
  category: "Database" | "Auth" | "Validering" | "Discord" | "Storage" | "Netværk" | "Backend";
  what: string;
  why: string;
  fix: string;
};

const ENTRIES: ErrorEntry[] = [
  {
    pattern: 'duplicate key value violates unique constraint "entries_league_car_number_uniq"',
    category: "Database",
    what: "To kørere prøver at bruge samme kørenummer i samme liga.",
    why: "Kørenumre er unikke pr. liga. En anden bruger nåede at tage nummeret før formularen blev sendt.",
    fix: "Vælg et andet kørenummer (den optagede er overstreget i listen). Hvis det er din egen tidligere tilmelding, redigér den i stedet for at oprette ny.",
  },
  {
    pattern: 'duplicate key value violates unique constraint',
    category: "Database",
    what: "En værdi findes allerede, men feltet kræver at den er unik.",
    why: "Du forsøger at oprette/redigere noget hvor en kombination (fx email, kørenummer, navn) allerede er brugt.",
    fix: "Brug en anden værdi. Den præcise konstraint står efter ordet 'constraint' i meddelelsen og fortæller hvilket felt der konflikter.",
  },
  {
    pattern: "new row violates row-level security policy",
    category: "Auth",
    what: "Databasen afviste handlingen fordi din bruger ikke har rettighed til at oprette/ændre rækken.",
    why: "Du er enten ikke logget ind, ikke godkendt, eller forsøger at ændre data der tilhører en anden bruger/team/admin.",
    fix: "Log ud og ind igen. Hvis problemet er på en admin-side, tjek at din bruger har admin-rollen. Ellers skriv på Discord.",
  },
  {
    pattern: "JWT expired",
    category: "Auth",
    what: "Din login-session er udløbet.",
    why: "Sessioner fornyes automatisk, men hvis enheden har været offline længe kan token udløbe.",
    fix: "Genindlæs siden. Hvis fejlen bliver ved, log ud og log ind igen.",
  },
  {
    pattern: "Unauthorized",
    category: "Auth",
    what: "Serveren modtog ingen gyldig login-token.",
    why: "Du forsøger at kalde en beskyttet handling uden at være logget ind, eller sessionen blev clearet i en anden fane.",
    fix: "Genindlæs siden og log ind igen.",
  },
  {
    pattern: "Vælg en liga",
    category: "Validering",
    what: "Formularen mangler en liga.",
    why: "Du trykkede send før der var valgt en liga i dropdown.",
    fix: "Vælg en liga i listen og prøv igen.",
  },
  {
    pattern: "Vælg en bilklasse",
    category: "Validering",
    what: "Formularen mangler bilklasse.",
    why: "Ligaen har flere klasser og der er ikke valgt en.",
    fix: "Vælg en bilklasse i dropdown.",
  },
  {
    pattern: "mindst 2 kørere",
    category: "Validering",
    what: "Team-lineup skal indeholde mindst 2 kørere.",
    why: "En team-tilmelding kræver to godkendte kørere før den kan bekræftes.",
    fix: "Sæt flueben ved mindst 2 medlemmer i lineup-listen før du sender.",
  },
  {
    pattern: "ikke tilmeldt",
    category: "Validering",
    what: "En valgt kører er ikke selv tilmeldt den valgte bilklasse.",
    why: "Begge team-kørere skal være individuelt tilmeldt ligaen i samme klasse før de kan med i team-lineup.",
    fix: "Bed køreren tilmelde sig ligaen i den klasse, eller vælg en anden klasse hvor begge er tilmeldt.",
  },
  {
    pattern: "Expected 3 parts in JWT",
    category: "Backend",
    what: "Backend prøvede at læse en gammel JWT-nøgle men fik en ny format-nøgle.",
    why: "Intern konfiguration på serveren — ikke din skyld.",
    fix: "Skriv på Discord med screenshot. Admin skal opdatere nøglekonfigurationen.",
  },
  {
    pattern: "Failed to fetch",
    category: "Netværk",
    what: "Browseren kunne ikke nå serveren.",
    why: "Mistet internet, dårligt WiFi, eller serveren var kortvarigt nede.",
    fix: "Tjek din forbindelse og genindlæs siden. Hvis det varer ved, vent et minut og prøv igen.",
  },
  {
    pattern: "NetworkError",
    category: "Netværk",
    what: "Netværksfejl undervejs i kaldet.",
    why: "Forbindelsen blev afbrudt midt i en forespørgsel.",
    fix: "Prøv igen. Hvis fejlen gentager sig, skift netværk (fx fra mobildata til WiFi).",
  },
  {
    pattern: "Unsupported provider",
    category: "Auth",
    what: "Login-udbyderen (fx Google) er ikke aktiveret på serveren.",
    why: "Intern konfiguration — udbyderen mangler at blive sat op.",
    fix: "Skriv på Discord, admin skal aktivere providerens konfiguration.",
  },
  {
    pattern: "Email rate limit exceeded",
    category: "Auth",
    what: "Der er sendt for mange mails til samme adresse på kort tid.",
    why: "Spam-beskyttelse i auth-systemet.",
    fix: "Vent 5-10 minutter før du prøver at sende magisk link/bekræftelse igen.",
  },
  {
    pattern: "User already registered",
    category: "Auth",
    what: "Der findes allerede en bruger med den email.",
    why: "Du forsøger at oprette en konto med en email der allerede er i systemet.",
    fix: "Brug 'Log ind' i stedet, eller nulstil adgangskoden hvis du har glemt den.",
  },
  {
    pattern: "Invalid login credentials",
    category: "Auth",
    what: "Forkert email eller adgangskode.",
    why: "Email findes ikke, eller adgangskoden matcher ikke.",
    fix: "Tjek stavning. Brug 'glemt adgangskode' hvis du er i tvivl.",
  },
  {
    pattern: "row-level security",
    category: "Auth",
    what: "Du mangler rettighed til at læse eller ændre denne række.",
    why: "Adgangskontrol i databasen blokerede handlingen — typisk fordi rækken tilhører en anden bruger.",
    fix: "Tjek at du er logget ind med den rigtige bruger. Hvis du burde have adgang, skriv på Discord.",
  },
  {
    pattern: "violates foreign key constraint",
    category: "Database",
    what: "En relateret række mangler eller blev slettet.",
    why: "Du forsøger at pege på fx en liga, en bruger eller et team der ikke længere findes.",
    fix: "Genindlæs siden så listen opdateres, og vælg en gyldig værdi.",
  },
  {
    pattern: "null value in column",
    category: "Database",
    what: "Et påkrævet felt blev sendt tomt.",
    why: "Formularen mangler validering på et felt der er obligatorisk i databasen.",
    fix: "Udfyld alle felter. Skriv på Discord hvis fejlen sker selvom alt er udfyldt — det er en bug.",
  },
  {
    pattern: "Discord interaction failed",
    category: "Discord",
    what: "En Discord-kommando eller knap kunne ikke fuldføres.",
    why: "Token udløbet, bot mangler rettighed i kanalen, eller meddelelsen er for gammel (>15 min).",
    fix: "Kør kommandoen igen. Hvis det er en knap på en ældre besked, brug /-kommandoen i stedet.",
  },
  {
    pattern: "lobby code",
    category: "Discord",
    what: "Lobby code-feltet havde et problem.",
    why: "Feltet er nu valgfrit — gammel cache i Discord-appen kan stadig kræve det.",
    fix: "Genstart Discord-appen og prøv igen.",
  },
  {
    pattern: "Storage object not found",
    category: "Storage",
    what: "Filen findes ikke længere i lageret.",
    why: "Filen er blevet slettet eller flyttet siden linket blev lavet.",
    fix: "Upload filen igen eller opdater linket.",
  },
  {
    pattern: "Payload too large",
    category: "Storage",
    what: "Filen du forsøger at uploade er for stor.",
    why: "Der er en max-grænse på upload-størrelse (typisk 5-50 MB).",
    fix: "Komprimér filen eller skalér billedet ned før upload.",
  },
  {
    pattern: "500",
    category: "Backend",
    what: "Generel serverfejl — noget gik galt på serveren.",
    why: "En uventet exception i backend-koden. Detaljerne står i serverloggen.",
    fix: "Tag screenshot inklusive tidspunktet og opret ticket på Discord. Inkludér hvad du forsøgte at gøre.",
  },
  {
    pattern: "504",
    category: "Backend",
    what: "Serveren brugte for lang tid på at svare.",
    why: "Tung forespørgsel eller midlertidig belastning.",
    fix: "Prøv igen om lidt. Sker det altid samme sted, skriv på Discord.",
  },
];

const CATEGORIES = ["Alle", "Database", "Auth", "Validering", "Discord", "Storage", "Netværk", "Backend"] as const;

function ErrorCatalog() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("Alle");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ENTRIES.filter((e) => {
      if (cat !== "Alle" && e.category !== cat) return false;
      if (!needle) return true;
      return (
        e.pattern.toLowerCase().includes(needle) ||
        e.what.toLowerCase().includes(needle) ||
        e.why.toLowerCase().includes(needle) ||
        e.fix.toLowerCase().includes(needle)
      );
    });
  }, [q, cat]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Fejlmeddelelser</h1>
        <p className="text-sm text-muted-foreground">
          Søg efter en fejl brugeren ser, og få forklaring + løsning.
        </p>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søg fx 'duplicate key', 'JWT', 'kørenummer'…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                cat === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} af {ENTRIES.length} fejl{filtered.length === 1 ? "" : ""} vist
      </p>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Ingen fejl matcher søgningen. Prøv færre ord eller et andet udsnit af meddelelsen.
            </CardContent>
          </Card>
        ) : (
          filtered.map((e) => (
            <Card key={e.pattern}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="font-mono text-sm break-all">{e.pattern}</CardTitle>
                  <Badge variant="secondary" className="text-[10px]">{e.category}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Hvad betyder det</p>
                  <p>{e.what}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Hvorfor opstår det</p>
                  <p>{e.why}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Løsning</p>
                  <p>{e.fix}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
