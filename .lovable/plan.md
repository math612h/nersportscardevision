## Mål

1. Lås team-skift mens et team deltager i en aktiv liga.
2. Eksplicit team-tilmelding til ligaer — kun team owner — med lineup og Discord-bekræftelse.
3. Vis en team-entry-liste på liga-siden (kun logo + navn).

---

## 1. Aktiv liga = lås team-medlemskab

**Definition af "aktiv liga":**
- Start: mindst ét `league_results`-row findes for ligaen (første afdeling kørt + uploadet).
- Slut: når `league_results` findes for ligaens sidste planlagte runde (`divisions` count = distinct rounds med resultater).

**DB-funktion** `public.league_is_active(_league_id uuid)` — returnerer boolean.

**DB-funktion** `public.user_is_locked_to_team(_user_id uuid)` — returnerer `team_id` hvis brugeren er på et `league_team_lineup`-row i en aktiv liga, ellers NULL.

**Triggers:**
- `team_members` BEFORE DELETE/UPDATE: bloker hvis `user_is_locked_to_team(user_id)` matcher dette team.
- `team_applications` BEFORE UPDATE (status='accepted'): bloker hvis ansøgeren er låst til andet team.
- `team_invitations` BEFORE UPDATE (status='accepted'): samme.

**UI:** disabled "Forlad team" / "Skift team"-knapper + tooltip: *"Låst til [Team X] indtil [Liga Y] er færdig"*.

---

## 2. Eksplicit team-tilmelding (kun team owner)

**Nye tabeller:**

`league_team_entries`
- `league_id`, `team_id`, `submitted_by` (= owner), `status` (`pending`/`confirmed`/`withdrawn`)
- UNIQUE(`league_id`, `team_id`)

`league_team_lineup`
- `league_team_entry_id`, `user_id`, `status` (`invited`/`accepted`/`declined`), `discord_message_id`, `responded_at`
- UNIQUE(`league_team_entry_id`, `user_id`)
- UNIQUE(`league_id` via FK, `user_id`) — én bruger kan kun være på ét team-lineup pr. liga.

**Flow:**
1. Kun team owner ser "Tilmeld team i [Liga]"-knap på team-side eller liga-side.
2. Owner vælger team-medlemmer der allerede har en individuel `entries`-row i ligaen → opretter `league_team_entries` (pending) + `league_team_lineup` rows (invited).
3. Hver invited bruger får en Discord-DM via eksisterende `discord.interactions.ts`-flow med Accepter/Afvis-knapper.
4. Når alle har accepteret → `league_team_entries.status = confirmed`. Hvis nogen afviser → owner kan fjerne/erstatte indtil ligaen er aktiv.
5. Når ligaen bliver aktiv (første resultat uploadet) → lineup låses (ingen tilføj/fjern, kun via admin).

**`compute_team_score` opdateres** så den joiner via `league_team_lineup` i stedet for at antage at alle team-medlemmer i `entries` tæller som team.

**Auto-afvist:** invited rows uden svar 24 timer før første race → automatisk `declined` (cron job).

---

## 3. Team-entry-liste på liga

Ny sektion på `ligaer.$leagueId.index.tsx`: **"Teams i ligaen"** — viser kun confirmed `league_team_entries` som kompakte kort med team-logo (avatar) + team-navn. Klik → team-side.

---

## Teknisk

**Migration 1:** `league_team_entries` + `league_team_lineup` tabeller med GRANTs + RLS + indexes.

**Migration 2:** `league_is_active()`, `user_is_locked_to_team()` funktioner + triggers på `team_members`/`team_applications`/`team_invitations`.

**Migration 3:** Opdateret `compute_team_score` der bruger `league_team_lineup`.

**UI-filer der ændres:**
- `src/routes/teams.$teamId.tsx` — "Tilmeld team i liga"-dialog (owner-only), liste af ligaer + team-medlemmer der allerede er tilmeldt
- `src/routes/ligaer.$leagueId.index.tsx` — ny "Teams"-sektion (logo + navn)
- `src/components/TeamsHub.tsx` / team-medlemmer-UI — disabled state + tooltip ved lås
- `src/routes/api/public/discord.interactions.ts` — nye custom_id'er `team_lineup_accept:<id>` / `team_lineup_decline:<id>`
- Ny server fn `src/lib/league-team-entries.functions.ts` — owner-tilmelding, lineup-mgmt, Discord-DM-sending
- Ny cron-route `api/public/cron/expire-team-lineup.ts`

---

## Spørgsmål inden implementering

1. Skal en bruger som er låst til et team også blokeres fra at *modtage* invitationer fra andre teams (eller skal de bare ikke kunne acceptere)?
2. Hvis en team-tilmelding kun har 1 bekræftet kører på racedag — skal `league_team_entries` automatisk gå til `withdrawn` eller forblive `pending`/`confirmed`? (Hvad er minimum lineup-størrelse for at tælle som "team"?)
3. Skal team-entry-listen på liga-siden vises før eller efter "Teams skal være confirmed" — altså vis alle pending også, eller kun confirmed?