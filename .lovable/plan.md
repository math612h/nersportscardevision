# Kenneth kan ikke flyttes fra LMGT3 til LMP2 i Odyssé

## Hvad jeg fandt i data

- Kryds-knappen virkede faktisk: Kenneth Dahl blev fjernet fra Odyssés LMGT3-lineup i dag kl. 20:02:50.
- Tre sekunder senere blev **Daniel selv** også fjernet fra LMGT3-lineupet (20:02:53) — det ligner en fejlklik-følge af at rækken bliver stående på listen med streg over og teksten "fjernet", så det ser ud som om intet skete.
- Det, der reelt blokerer flytningen, er en anden ting: Kenneth står stadig som **LMGT3** på team-siden. Lineup-dialogen kræver, at køreren både er tildelt klassen i teamet og selv er tilmeldt klassen i ligaen. Kenneth er tilmeldt LMP2 i ligaen (bil #6), men hans team-klasse er LMGT3 — derfor kan han ikke vælges til LMP2-lineupet.

## Hvad jeg gør

### 1. Ret data for Odyssé Cronos Racing
- Sæt Daniel Kokborg tilbage på LMGT3-lineupet (fjern-markeringen ophæves, hans bidrag i tidligere afdelinger er uændrede).
- Skift Kenneth Dahls klasse på team-siden fra LMGT3 til LMP2, så han kan vælges til LMP2-lineupet.
- Kenneths fjernelse fra LMGT3-lineupet bevares som den er — hans point i allerede kørte afdelinger tæller stadig med for teamet.
- Daniel tilføjer selv Kenneth til LMP2-lineupet bagefter (han får en Discord-besked og skal acceptere).

### 2. Gør brugerfladen tydeligere, så det ikke sker igen
- Fjernede kørere flyttes ned i en lille, sammenklappet "Tidligere lineup"-linje under det aktive lineup, i stedet for at blive stående midt i listen. Så er det synligt med det samme, at fjernelsen lykkedes.
- Bekræftelses-teksten før fjernelse nævner kørerens navn tydeligere, så man ikke rammer forkert række.
- I "Tilføj kører"-dialogen får en kører, der mangler den rigtige klasse på team-siden, en tydeligere forklaring med en direkte henvisning til, hvor klassen ændres.

### 3. Tidligere ligaer vises ikke længere som aktive lineups
- Lineups i ligaer, der er afviklet (sidste afdeling er kørt), flyttes ud af "Team-tilmeldinger" og ned i en sammenklappet "Tidligere ligaer"-sektion.
- Historikken bevares og kan foldes ud, men kun igangværende ligaer fremstår som aktive lineups.

## Teknisk

- Datafix køres som SQL: `league_team_lineup.effective_until = NULL` for Daniels LMGT3-række (`ecd320fc-…`), og `team_members.car_class = 'LMP2'` for Kenneth i team `066b0678-…`.
- `src/components/LeagueTeamSignupCard.tsx`: opdel `league_team_lineup` i aktive og fjernede (`effective_until != null`); fjernede vises i en `details`-lignende sammenklappet blok. Samme fil får en ekstra query mod `divisions` (max `race_date` pr. liga) og deler tilmeldingerne i aktive ligaer og afviklede ligaer (sidste `race_date` er passeret) — afviklede vises sammenklappet. Ingen ændring i server-funktioner eller pointlogik.
- `src/components/TeamLeagueSignupDialog.tsx`: kun tekstændring på den eksisterende `reason`-visning.
- Ingen ændringer i `removeDriversFromLineup`, `submitTeamForLeague` eller team-pointberegningen.
