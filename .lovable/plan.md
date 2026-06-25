## Mål
Gem `GameVersion` fra LMU-resultatfilerne på `leaderboard_times`, og lad brugerne filtrere leaderboardet efter én eller flere patch-versioner.

## XML-feltet
Bekræftet fra din uploadede fil: `<GameVersion>1.3000</GameVersion>` ligger direkte under `<RaceResults>`. Eksisterende rækker uden version vises som "Ukendt".

## Ændringer

### 1. Database (migration)
- Ny kolonne `game_version text` på `leaderboard_times` (nullable).
- Index på `(game_version)` så filter er hurtigt.

### 2. Parsere – udtræk `GameVersion`
Tre filer skal opdateres parallelt så browser-upload, server-upload og companion alle får version med:
- `src/lib/lmu-parser.ts` (browser/DOM)
- `src/lib/lmu-parser-server.ts` (worker/fast-xml-parser)
- `companion/electron/lmu-parser.cjs` (Electron)

Tilføj `gameVersion: string | null` på `ParsedRace`-typen og læs `childValue(rr, "GameVersion")`.

### 3. Upload-stier – gem versionen
- `src/routes/api/public/leaderboard-upload.ts`: tilføj `game_version: parsed.gameVersion` på row inden upsert.
- DB-funktion `upload_leaderboard_time_with_device_token`: tilføj `_game_version text` parameter og INSERT-kolonne.
- Companion-uploader (`companion/electron/uploader.cjs`) sender allerede hele parsed payload — bekræft at `gameVersion` følger med, eller tilføj eksplicit felt til RPC-kaldet.

### 4. Leaderboard UI – filter
I `src/routes/leaderboard.tsx`:
- Hent `game_version` med i `getLeaderboardRows` (`src/lib/leaderboard.functions.ts`).
- Beregn unik liste af versioner fra dataen, sorteret nyest først (semver-agtig sortering på dot-tal).
- Tilføj multi-select "Patch-version" filter (popover med checkboxes, samme look som eksisterende filtre). Default: alle valgt.
- Rækker uden version vises som "Ukendt" og kan til-/fravælges.
- Filter anvendes klient-side på den allerede hentede liste.

## Tekniske noter
- Versionen behandles som tekststreng (LMU bruger `1.3000`, `1.2.2.x` osv.) — sortering laver numerisk split på `.` med fallback.
- Ingen backfill: gamle rækker forbliver `NULL` = "Ukendt".
- Ingen ændringer i scoring/rating-funktioner.

## Filer der ændres
- migration (ny kolonne + RPC-opdatering)
- `src/lib/lmu-parser.ts`
- `src/lib/lmu-parser-server.ts`
- `src/lib/leaderboard.functions.ts`
- `src/routes/api/public/leaderboard-upload.ts`
- `src/routes/leaderboard.tsx`
- `companion/electron/lmu-parser.cjs`
- `companion/electron/uploader.cjs` (kun hvis nødvendigt)
