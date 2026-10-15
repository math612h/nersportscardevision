# Drop-runde synlig i stillingerne

## Beslutninger (fra brugeren)

- **Selve stillingen** på ligasiden regnes med drop-runden — ikke en separat kolonne.
- Den runde med **laveste point streges** — DNS (0 point) tæller med og vil typisk være den, der ryger.
- **Tiltrædelsespoint (TP) kan streges**, hvis en TP-runde er den værste.
- **Team-stillingen** følger samme princip.
- **Discord-stillingerne ændres ikke** — de viser fortsat den fulde total.

## Hvad der bygges

### 1. Indstilling på ligaen

- Nyt felt `drop_rounds` i ligaens pointsystem (`leagues.points_system` — et JSON-felt, så **ingen databasemigrering**).
- `PointsSystemEditor` i kontrolpanelet får et lille talfelt "Antal drop-runder" (0 = slået fra), så reglen kan ændres pr. liga uden hjælp.
- ICE Cup sættes til 1 drop-runde via en dataopdatering.

### 2. Kørerstillingen regnes med drop

I `Standings` på ligasiden (`src/routes/ligaer.$leagueId.index.tsx`):

- Når `drop_rounds > 0` og der er kørt flere afdelinger end antallet af drop-runder: hver kørers runde med laveste netto-point (point minus pointstraf) markeres som drop-runde. DNS = 0 point, TP tæller med på lige fod med rigtige runder.
- Den strede rundes point og pointstraf tæller ikke i totalen; kørerne sorteres på den nye total.
- Den strede runde vises tydeligt i tabellen: cellen dæmpes/overstreges med en lille "Drop"-markering, så man kan se præcis hvilken runde der er stroget.
- Er der færre kørte afdelinger end drop-runder, streger vi ingenting endnu.

### 3. Team-stillingen følger samme princip

- Pr. team pr. klasse: afdelingen med laveste team-point streges og tæller ikke i teamets total.
- Visuelt markeret på samme måde som kørerstillingen.

### 4. Forklaring på siden

- Én kort linje under "Stillinger"-overskriften: "Hver kørers værste afdeling streges (drop-runde) og tæller ikke i totalen." — så ingen undrer sig over den overstregede celle.

## Begrænsninger og konsekvenser

- **Discord-stillingerne** ("Opdater stillinger på Discord") viser fortsat den fulde total uden drop — de kan derfor afvige fra hjemmesiden midt i sæsonen. Først ved sæsonafslutning, når drop-runden reelt træder i kraft, stemmer de overens.
- Point i databasen ændres ikke — drop-runden er ren visningslogik, så den kan slås fra/om justeres uden dataindgreb.
- Admin-siden for stillinger (kontrolpanelet) er uændret — den viser rå point pr. afdeling.

## Tekniske detaljer

- `src/components/PointsSystemEditor.tsx`: `drop_rounds?: number` tilføjes til `PointsSystem`-typen + et tal-input i editoren.
- `src/routes/ligaer.$leagueId.index.tsx`:
  - `Standings`: efter opbygning af `rounds` findes `dropDivisionId` pr. kører (laveste `points - pointPenalty`); `total` og `pointPenalty` fratrækkes den strede runde; cellen renderes med overstregning + titel "Drop-runde".
  - `TeamStandings`: tilsvarende pr. team (laveste `rounds[d.id].points`), kun blandt afdelinger hvor teamet scorede.
  - Læs `drop_rounds` fra `league.points_system` (hentes allerede i begge komponenter).
- Dataopdatering: `UPDATE leagues SET points_system = points_system || '{"drop_rounds":1}' WHERE id = '68f86ec5-…'` (ICE Cup).
- Verificering: byg + visuel test i previewet (ICE Cup-stillingen: kontrollér at værste runde er overstreget, og at totalen passer).
