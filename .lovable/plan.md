# NER Sportscar Companion v2 — plan

## Hvad slutbrugeren oplever

1. Klikker på "Download Companion" på leaderboard-siden → henter **én fil**: `NER-Sportscar-Companion-Setup.exe` (~80 MB)
2. Dobbeltklikker filen → installerer sig selv på 5 sekunder → genvej på skrivebordet og i startmenuen → appen starter automatisk
3. Logger ind én gang med sin NER-konto (samme som hjemmesiden) → forbliver logget ind for altid (også efter genstart)
4. Appen kører usynligt i baggrunden hver gang PC'en startes (system tray-ikon nede til højre)
5. Når brugeren kører i Le Mans Ultimate, læses omgangstider automatisk og uploades til leaderboardet

## Hvad jeg bygger

### Companion-appen (Electron + React)

Placeret i `companion/` mappen i dette projekt. Indeholder:

- **Hovedproces** (`companion/electron/main.cjs`)
  - System tray-ikon (højreklik → "Åbn", "Log ud", "Afslut")
  - Auto-start ved Windows-boot via `app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })`
  - Skjult vindue der kan kaldes frem fra tray
  - Læser LMU's resultatfiler fra `%UserProfile%\Documents\Le Mans Ultimate\UserData\Log\Results\` (og `Replays/` for tidligere sessioner) hvert 10. sekund
  - Parser XML/JSON-resultater til omgangstider per bil/bane/spiller

- **UI** (lille React-app i `companion/src/`)
  - Login-skærm (e-mail + adgangskode + Google) — kun vist første gang
  - Status-skærm: "Forbundet som [navn] · LMU fundet · X omgange uploaded i dag"
  - Login-token gemmes krypteret i Electron's `safeStorage` (Windows DPAPI) → overlever genstart

- **Upload-logik**
  - Kalder Lovable Cloud (Supabase) direkte med brugerens token
  - Skriver til `leaderboard_times`-tabellen via en ny serverfunktion `submitLapTimes` der validerer ejerskab og deduplikerer

### På hjemmesiden (denne app)

- Ny serverfunktion `src/lib/companion.functions.ts` → `submitLapTimes()` der modtager omgangstider fra companion
- Opdater download-knappen på `src/routes/leaderboard.tsx` til at pege på den nye installer-URL (GitHub Release)

### Auto-build pipeline (GitHub Actions)

- `.github/workflows/build-companion.yml`
  - Kører på `windows-latest` når der pushes en tag som `companion-v1.0.0`
  - Bygger med `electron-builder --win nsis` (giver én `Setup.exe` med:
    - one-click installation (ingen "Næste → Næste")
    - genvej på skrivebordet og startmenu
    - auto-start ved boot)
  - Uploader `.exe`'en som GitHub Release-asset
- Hjemmesidens download-knap peger på `https://github.com/<dit-repo>/releases/latest/download/NER-Sportscar-Companion-Setup.exe`

## Hvad DU skal gøre (én gang, ~5 min)

1. **Forbind dette Lovable-projekt til GitHub** (Plus-menu → GitHub → Connect)
2. **Push første tag** når jeg siger til:
   ```
   git tag companion-v1.0.0
   git push origin companion-v1.0.0
   ```
3. **Vent ~5 min** mens GitHub bygger `.exe`'en
4. **Færdig** — download-knappen virker automatisk

Fremover: når jeg laver ændringer i companion-koden, pusher du bare en ny tag (`companion-v1.0.1` osv.) og den nye installer er klar 5 min efter.

## Tekniske detaljer

```text
companion/
├── package.json              electron-builder config med NSIS one-click
├── electron/
│   ├── main.cjs              main process: tray, auto-start, LMU watcher
│   ├── preload.cjs           IPC bridge
│   └── lmu-watcher.cjs       parser for LMU's results-filer
├── src/                      React UI (login + status)
├── build/
│   └── icon.ico              app-ikon
└── vite.config.ts            base: './' (krav for Electron)

.github/workflows/
└── build-companion.yml       Windows-build → GitHub Release
```

LMU's resultatfiler ligger som XML i `Log\Results\` (samme format som rFactor 2 — Le Mans Ultimate er bygget på samme motor). Hver session genererer én XML med alle omgangstider per kører.

## Forbehold / antagelser

- **LMU's filformat** er det samme som rFactor 2. Hvis det viser sig at LMU bruger noget andet, justerer jeg parseren — men jeg har set i tidligere builds at denne sti virker
- **Auto-update** (appen henter selv nye versioner) er IKKE med i v1. Kan tilføjes senere via electron-updater hvis ønsket
- **macOS/Linux** support er ikke med — kun Windows (LMU findes kun til Windows)
- **Den eksisterende zip-download** fjernes når den nye installer er klar

## Klar til at gå i gang?

Sig "kør" hvis planen ser god ud, så bygger jeg companion-koden + workflow nu. Når det er færdigt giver jeg dig præcise instrukser til GitHub-forbindelse og første tag-push.
