## Del 1 — Ny team-point logik

**Beregning pr. løb pr. klasse:**
1. Find alle accepterede lineup-medlemmer fra et team der faktisk har en placering i den klasse i det løb.
2. Hvis < 2 deltog → teamet får 0 point (uændret krav).
3. Beregn medianen af deres positioner (klasseplaceringer).
4. Ranger teams i klassen efter laveste median → bedste = 1.
5. Tildel point: P1 = 30, P2..N = `points_per_position[i]` fra ligaens solo-pointsystem (index 1..N-1). Hvis solo-systemet allerede har P1 ≥ 30, overrides P1 til 30. FL-point gives ikke til teams.

**Hvor ændres det:**
- `src/routes/index.tsx` (`latestTeamStandings`) — forsidens "seneste team-resultater"-kort.
- `src/routes/ligaer.$leagueId.index.tsx` (`TeamStandings`) — samlet sæson-stilling: summér 30/point-pr-løb i stedet for nuværende sum-af-medlems-point.
- Fælles helper: ny `src/lib/team-points.ts` med `computeTeamRacePoints(raceRows, lineupByTeam, pointsSystem)` så forside + liga-side bruger samme logik.

## Del 2 — "Upload resultater"-side

**Admin-flow ændringer i `_authenticated._admin.admin.ligaer.$leagueId.afdelinger.tsx`:**
- Erstat de to upload-knapper (quali + race) på hvert afdelingskort med én knap: **"Upload resultater"** → navigerer til ny route.

**Ny route:** `src/routes/_authenticated._admin.admin.ligaer.$leagueId.afdelinger.$divisionId.upload.tsx`

**UI:**
- To upload-felter øverst: "Quali-fil (XML)" og "Race-fil (XML)". Begge valgfri, men mindst én skal være valgt før preview.
- Når en fil vælges → parses lokalt (genbruger `parseLmuRaceFileServer` via ny `previewLeagueRaceResult` server-fn der KUN parser+matcher uden at skrive til DB).
- Resultater vises pr. klasse i en tabel:
  - Kolonner: Pos · Kører · Bil · Omgange · Bedste omgang · Finish-tid · Point · **Straffe** · Handlinger
  - Hver række kan redigeres inline.
- **Straffe pr. kører:**
  - Tidsstraf (sek) — lægges til finish_ms, kan ændre placering
  - Positions-straf (+X pladser) — flytter ned i klassen
  - Pointfradrag (X point)
  - DSQ-toggle — 0 point, sidst i klassen
- Omberegner placering + point live når en straf ændres.
- Knap **"Publicér resultater"** nederst → kalder ny `publishLeagueRaceResult` server-fn med de redigerede rækker + straffe (én call pr. session_type, eller samlet hvis begge filer er valgt). Først her skrives til `league_results` + `divisions.settings.results`.

**Server-functions (`src/lib/league-results.functions.ts`):**
- Ny `previewLeagueRaceResult` — parser XML, matcher kørere, returnerer rækker uden at skrive.
- Ny `publishLeagueRaceResult` — modtager allerede-behandlede rækker + straffe-array, anvender straffe, gemmer (samme upsert-logik som nuværende `uploadLeagueRaceResult`). Bevarer DNF-tærskel logik fra pointsystem.
- Behold gammel `uploadLeagueRaceResult` indtil ny er live, fjern den derefter.

**Datamodel:**
- Tilføj kolonner til `league_results`: `time_penalty_ms` (int, default 0), `position_penalty` (int, default 0), `points_penalty` (int, default 0), `dsq` (bool, default false), `laps` (int, nullable — bruges også til omgange-visningen). Migration i samme tur.
- `divisions.settings.results` udvides med samme felter så forsiden kan vise straffe.

## Tekniske detaljer

- Team-point beregning kører server-side når liga-stilling læses, men cache via React Query (sker allerede).
- Median = midterværdi af sorterede positioner; ved lige antal → gennemsnit af de to midterste.
- Preview-route bruger `_authenticated._admin` så kun admins har adgang.
- Filparsing sker server-side (LMU XML er stor og bruger DOMParser-server), men preview-resultatet gemmes i React state indtil publish.

## Filer der røres

Nye:
- `src/lib/team-points.ts`
- `src/routes/_authenticated._admin.admin.ligaer.$leagueId.afdelinger.$divisionId.upload.tsx`
- Migration: `add penalties + laps to league_results`

Ændrede:
- `src/lib/league-results.functions.ts` (split i preview + publish)
- `src/routes/_authenticated._admin.admin.ligaer.$leagueId.afdelinger.tsx` (knap-erstatning)
- `src/routes/index.tsx` (team-point logik)
- `src/routes/ligaer.$leagueId.index.tsx` (team-point logik)
