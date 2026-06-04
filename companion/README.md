# DanishEnduranceSeries.dk Companion

Lille Windows-app der overvåger Le Mans Ultimate's resultatfiler og automatisk uploader nye omgangstider til DanishEnduranceSeries.dk leaderboard.

## Features

- ✅ One-file installer (`.exe`) — dobbeltklik → installeret på 5 sekunder
- ✅ Starter automatisk ved Windows-opstart, kører i system tray
- ✅ Login én gang — token gemmes krypteret (Windows DPAPI), overlever genstart
- ✅ Læser både nye og eksisterende LMU resultat-XML'er
- ✅ Uploader kun nye tider (dedupliker via fil-hash)

## Lokal udvikling

```bash
cd companion
npm install
npm run electron:dev
```

## Byg lokalt (kræver Windows)

```bash
npm run dist
# → release/DES-Companion-Setup.exe
```

## Produktions-build via GitHub Actions

Push en tag som starter med `companion-v`:

```bash
git tag companion-v1.0.0
git push origin companion-v1.0.0
```

Workflow'en i `.github/workflows/build-companion.yml` bygger automatisk `.exe`'en og uploader den som GitHub Release. Hjemmesidens download-knap peger på `releases/latest/download/DES-Companion-Setup.exe`.

## Konfiguration

Supabase URL og publishable key er hardcoded i `electron/config.cjs`. Disse er offentlige nøgler — RLS-policies styrer adgang.
