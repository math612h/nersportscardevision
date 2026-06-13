## Mål

1. Sende Discord-DM (ikke kun website-notifikation) når en kører rykkes op fra ventelisten — teksten skal sige om det gælder hele ligaen eller én enkelt afdeling.
2. Når en kører melder afbud til en afdeling: kør automatisk et reserve-tilbud-flow til ventelisten i samme klasse/kategori. Reserven får 24 timer til at acceptere; ellers går tilbuddet videre til den næste. Den afløsende reserve kører kun den ene afdeling — bagefter er de tilbage på ventelisten med deres oprindelige plads i køen. Den fraværende køres tidligere points i ligaen bevares automatisk (vi sletter aldrig `league_results`).

## Del 1 — Discord-DM ved oprykning

Udvid `setProfileApproval` (`src/lib/leagues.functions.ts`) og `leaveLeague` så de eksisterende oprykningsnotifikationer også sender Discord-DM via `sendDiscordDM` (best-effort, samme mønster som `admin-messages.functions.ts`). Teksten siger eksplicit "Du er rykket op på griddet i **{liga}** ({klasse} · {kategori}) for resten af sæsonen". Det nye reserve-flow bruger en separat tekst: "for afdelingen **{afdeling}**".

## Del 2 — Reserve-flow for én afdeling

### Datamodel

Ny tabel `public.division_reserve_offers`:

- `division_id` (fk) — afdelingen pladsen gælder
- `absentee_user_id` (fk auth.users) — hvem pladsen er ledig efter
- `offered_user_id` (fk auth.users) — reserven der får tilbuddet
- `car_class`, `driver_category` (text) — låst klasse/kategori for tilbuddet
- `status` enum: `pending | accepted | declined | expired | superseded`
- `expires_at` timestamptz (created_at + 24t)
- `responded_at` timestamptz nullable
- unik på (division_id, offered_user_id) — samme reserve spørges aldrig to gange for samme afdeling, uanset hvor mange der melder afbud

RLS: kun reserven (offered_user_id) + admin kan læse/opdatere sin egen række. Service role bruges fra serverfunktioner.

### Server-funktioner (`src/lib/division-reserves.functions.ts`)

- `offerNextReserve({ divisionId, absenteeUserId, carClass, driverCategory })` (intern, kører fra absence-trigger og fra cron/respond-flowet): finder ældste approved waitlister på ligaen i samme klasse/kategori som:
  - ikke allerede har en entry for **denne afdeling**
  - ikke står i `division_reserve_offers` for (division_id, user_id) — uanset status
  - er ≠ alle aktuelt fraværende
  Indsætter `pending` række (24t udløb), sender website-notifikation + Discord-DM med accept/decline link til `/incidents`-lignende side eller direkte til afdelingen. Hvis ingen kandidater: ingen handling.
- `respondReserveOffer({ offerId, accept: boolean })` (kalles af reserven):
  - hvis `accept`: marker offer `accepted`. Indsæt en **division-level entry** (`division_id` sat, `waitlist=false`, samme klasse/kategori, reservens eget `driver_name`/`car_number`). Reservens liga-entry (waitlist) røres ikke. Send bekræftelse-notifikation + DM til både reserve og absentee.
  - hvis `!accept`: marker `declined`, kald `offerNextReserve` med samme parametre.
- `expireStaleReserveOffers()` — kører periodisk (pg_cron via eksisterende `/api/public/cron/...` mønster, hver 10. min): markerer `pending` rækker hvor `expires_at < now()` som `expired` og kalder `offerNextReserve` for hver.

### Trigger fra afbud

I `src/routes/ligaer.$leagueId.afdeling.$divisionId.tsx`: efter en `division_absences` insert lykkes, kald `offerNextReserve` (best-effort try/catch). Hvis brugeren fjerner sit afbud igen og reserven ikke har accepteret endnu: marker eventuelle `pending` offers for (division_id, absenteeUserId) som `superseded` og slet automatisk reservens division-entry hvis offer var `accepted` (med notifikation til reserven).

### UI

- **Afdelingsside (`ligaer.$leagueId.afdeling.$divisionId.tsx`)**: når brugeren har et `pending` offer for afdelingen, vis et banner øverst med "Du er tilbudt en reserveplads — accepter inden {tid}" + accept/afslå knapper. På grid-listen vis fraværende kørere som "Udebliver" (allerede dækket) og evt. "Erstattet af {reserve}" når en accepteret reserve findes.
- **Forsiden (`src/routes/index.tsx`)**: udvid den eksisterende `useQuery("home-pending-incidents")` til også at tælle `pending` reserve-offers for brugeren, så Incidents-knappen viser badge — eller tilføj separat "Reserveplads tilbudt"-knap. (Vi udvider den eksisterende badge for at holde det enkelt.)

### Points-bevaring

`league_results` er bundet til `user_id` direkte og rives aldrig ned ved entry-ændringer. Reserven får sine egne resultater på sin egen `user_id`. Når absenteen senere får sin plads tilbage på griddet, indeholder stillingen automatisk deres tidligere races. **Ingen kodeændring nødvendig** — bare verificer at stillings-beregningen (`src/lib/league-results.functions.ts`) summerer pr. `user_id` og ikke pr. `entry_id`.

## Teknisk

- Migration: ny tabel + RLS + GRANTs + opdatering af typer (afventer migration-godkendelse).
- Cron-route: `src/routes/api/public/cron/expire-reserve-offers.ts` (samme mønster som `cron/league-open.ts`). Konfigurer pg_cron til at kalde den hver 10. min — instruktion gives efter migrationen.
- Discord-DM: genbrug `sendDiscordDM` fra `src/lib/discord.server.ts`. Helper i den nye `.functions.ts` der slår `discord_user_id` op via `profiles_private`.
- Alle nye server-fns bruger `requireSupabaseAuth`. `supabaseAdmin` importeres inde i handler-bodies.

## Out of scope

- Manuel admin-override (admin kan stadig redigere entries direkte via admin-UI).
- Per-afdeling bilnumre — reserven beholder sit eget.
- Notifikation til absentee hvis ingen reserve siger ja (kan tilføjes senere).
