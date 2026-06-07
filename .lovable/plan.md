# Personligt arkiv + Pro/Am rating

## Mål
- Brugere kan se deres egen udviklingskurve (personligt arkiv)
- Ved tilmelding til en liga vurderer en algoritme om brugeren må vælge Pro, Am eller begge
- Algoritmen er dynamisk: opdateres når der kommer nye liga-resultater
- Lukkes en klasse, ryger eksisterende entries automatisk på venteliste

## 1. Klasse-lukning → venteliste
Når en `division` deaktiveres/slettes:
- Alle `entries` der peger på den division får `division_id = NULL` og `status = 'venteliste'`
- Implementeres via trigger på `divisions` (BEFORE DELETE + AFTER UPDATE når aktiv-flag ændres)

## 2. Datamodel for rating

### Lagring (gemmer alt — viser kun det bedste)
- Eksisterende `leaderboard_times` bruges som råmateriale (alle uploads beholdes)
- Tilføj kolonne `source` på `leaderboard_times`: `'daily'` (bruger-upload via companion) eller `'league'` (officielt liga-resultat). Dette adskiller dem klart.
- Liga-resultater logges separat per race i ny tabel `league_results`:
  - `user_id`, `league_id`, `division_id`, `race_id/round`, `track`, `car_class`, `best_lap_ms`, `avg_lap_ms`, `position`, `points`, `created_at`
  - Bruges som "tidligere resultater" (60% vægt)

### Visning (personligt arkiv)
Ny side `/profil/arkiv` (eller fane på `/profil`):
- Bedste tid per (bane, bil-klasse) kombination
- Liste over alle liga-deltagelser (resultater pr. løb)
- Udviklingskurve (graf) over bedste runde over tid

## 3. Rating-algoritme

### Skjult skill-score per (user, league)
Beregnes server-side, cached i tabel `user_league_ratings`:
- `user_id`, `league_id`, `car_class`, `score`, `confidence`, `updated_at`

**Formel:**
```
score = 0.4 * leaderboard_component + 0.6 * results_component
```

- `leaderboard_component`: brugerens bedste runde pr. bane (kun bil-klassen for ligaen) sammenlignet med øvrige liga-medlemmers bedste tider — normaliseret til 0–100
- `results_component`: gennemsnit af brugerens position/point i tidligere races i samme liga (eller andre ligaer som fallback)
- Når der er <3 deltagere med data: brug **median af hele leaderboardet** (alle brugere på platformen) i den ønskede bil-klasse som reference indtil nok data

### Klasse-tildeling ved tilmelding
- Brugerens score sammenlignes mod medianen af de allerede tilmeldte i ligaen i hver klasse
- Tillad **kun den klasse hvor brugeren ligger tættest på medianen** (mindst spredning → undgår 2 sek/omgang forskel)
- Hvis ligaen er tom / ingen data: tillad begge
- UI: tilmeldings-dropdown viser kun tilladte klasser + forklaring ("Algoritmen vurderer Pro passer bedst")

### Dynamisk opdatering
- Trigger på `league_results` insert → re-beregn `user_league_ratings` for alle i ligaen
- Trigger på `leaderboard_times` insert (kun `source='league'` påvirker rating; `daily` gemmes men vægter mindre/ikke for klasse-beslutning)
- Eksisterende entries re-evalueres IKKE automatisk (kun nye tilmeldinger)

## 4. Teknisk opdeling

### Migration 1 — schema
- `ALTER leaderboard_times ADD source text DEFAULT 'daily'`
- `CREATE TABLE league_results (...)`
- `CREATE TABLE user_league_ratings (...)`
- Trigger på `divisions` for venteliste-flytning
- RLS + GRANTs

### Migration 2 — funktioner
- `compute_user_league_rating(_user_id, _league_id)` (security definer)
- `allowed_classes_for_signup(_user_id, _league_id)` returns text[]
- Triggers der kalder ovenstående

### Server functions (`createServerFn`)
- `getMyArchive` → personligt arkiv (bedste tider + liga-historik + udviklingsdata)
- `getAllowedClasses({ leagueId })` → bruges af tilmeldings-UI
- `recomputeLeagueRatings({ leagueId })` (admin)

### UI
- `/profil` — ny fane "Mit arkiv" med graf (recharts) + tabel
- Tilmeldingsdialog — vis kun tilladte klasser
- Admin: knap til manuel re-beregning af rating

## Rækkefølge
1. Migration 1 (schema + trigger til venteliste)
2. Migration 2 (rating-funktioner)
3. Server functions
4. UI for personligt arkiv
5. UI for begrænset klassevalg ved tilmelding

## Åbne spørgsmål (jeg bygger ud fra disse antagelser hvis du ikke svarer)
- "Bedste tid pr. kombination" = bedste enkelt-runde i (bane × bil-klasse), uanset session
- Daily-uploads tæller IKKE for klasse-beslutning men vises i arkivet
- Eksisterende `leaderboard_times` markeres som `source='daily'` ved migration (alle gamle er bruger-uploads)
