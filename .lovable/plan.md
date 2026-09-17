# Udmeldte kørere bevarer deres resultater + manuel matchning i stillinger

## Problemet

Når en kører melder sig ud af en liga, bliver hans tilmelding slettet helt. Resultatsiden i kontrolpanelet bygger deltagerlisten ud fra de aktuelle tilmeldinger, så en udmeldt kører forsvinder fra redigeringen — og næste gang en afdeling gemmes, forsvinder hans tidligere resultater også fra stillingerne.

Kenneth Dahl Pedersen (LMGT3 Pro, bil #134) har stadig sine resultater fra Afdeling 1 (Silverstone, 7. plads, 22 point) og Afdeling 2 (Interlagos, 8. plads, 21 point) gemt i databasen, men ingen tilmelding.

## Det bliver lavet

### 1. Udmeldelse sletter ikke længere historikken
- Tilmeldingen bliver markeret som udmeldt i stedet for at blive slettet (nyt felt `withdrawn_at`).
- Udmeldte kørere fylder ikke en plads: de tæller ikke i kapacitet, ventelisteoprykning, deltagerlister, team-lineups eller nye afdelinger.
- Ventelisten rykker op præcis som i dag.
- I resultatredigeringen vises en udmeldt kører **kun** i de afdelinger, hvor han allerede har et gemt resultat — med mærkatet "Udmeldt". I nye afdelinger er han slet ikke med (hverken som DNS eller på listen).
- Stillingerne (forside, ligaside, afdelingsside) viser hans tidligere resultater uændret.

### 2. Kenneth Dahl Pedersen genskabes
Hans tilmelding oprettes igen som "udmeldt" med bil #134, LMGT3 Pro, så hans to resultater igen fremgår i ICE Cup-stillingen og i redigeringen af Afdeling 1 og 2. Point og placeringer bliver præcis som før udmeldelsen.

### 3. Navne der ikke kan matches bliver synlige og kan matches manuelt
I dag vises ikke-matchede navne kun i en engangsdialog under upload, og bagefter er de væk.
- Efter import vises et tydeligt felt øverst i resultatredigeringen: "X navne fra filen blev ikke matchet" med navnene listet.
- Kørere i redigeringen, som ikke fandtes i filen, markeres også, så det er let at se hvem der mangler tid.
- Knappen "Match kørere" åbner den samme dialog som Pro/Am-matchningen, så navnene kan kobles til en deltager bagefter — uden at uploade filen igen.
- Matchninger huskes i sessionen, så en ny import af samme fil bruger dem automatisk.

## Teknisk

- Migration: `entries.withdrawn_at timestamptz null`; `leaveLeague` i `src/lib/leagues.functions.ts` sætter feltet i stedet for at slette rækken. Unikke bilnummer-constraints ignorerer udmeldte rækker (partielt index), så nummeret kan genbruges.
- Alle steder der læser `entries` for grid/kapacitet/lineup (`leagues.functions.ts`, `league-admin-entries.functions.ts`, `league-results.functions.ts`, `class-capacity`, entry-lister, afdelingsside, team-lineups) filtrerer `withdrawn_at is null`.
- `src/routes/_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx`: `entries`-query henter også udmeldte; `buildInitial` medtager en udmeldt entry kun hvis `division.settings.results` (eller `quali_results`) allerede indeholder hans `user_id`; rækken markeres med badge "Udmeldt".
- Samme fil: parsede navne uden match gemmes i state (`unresolvedNames`) i stedet for kun i `pendingMatch`, vises i et banner, og `pendingMatch` kan genåbnes via knap. Drivere der matcher en profil men ikke har en række i griddet (i dag `continue` uden besked) tilføjes til samme liste.
- Kenneth genskabes med en `INSERT` i `entries` (league `68f86ec5…`, user `a400010e…`, LMGT3/Pro, car_number 134, `withdrawn_at` sat).
