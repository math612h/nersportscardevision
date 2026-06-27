# LMU Danmark Coaching — komplet sektion

## Oversigt
En ny "Coaching" sektion på siden hvor brugere kan booke 1:1 coaching med dedikerede coaches, og hvor coaches kan administrere profil, tilgængelighed og bookinger. Alt orchestreret med Discord-notifikationer (PM-flow) og admin-kontrol af coach-rollen.

## Navigation / entry points
- Burger-menu link: "Coaching" → `/coaching`
- Kontrolpanel: ny side "Coaches" til at tildele/fjerne `coach` rolle
- Coach-only adgang til "Min coach profil" og "Min kalender" (vises kun for brugere med coach-rollen)

## Side-struktur

### `/coaching` — Hero / landing
- Hero med overskrift, undertekst, og to CTA:
  - **Book coaching** → starter booking-wizard
  - **Vi tilbyder** → scroller til afsnit med alle fokus-områder + forklaring
- Premium motorsport look: mørke gradients, accent-farver fra eksisterende design tokens, hero-billede/banner

### Booking-wizard (multi-step, samme route med state, eller `/coaching/book`)
1. **Vælg fokuspunkter** (multi-select chips, 19 prædefinerede punkter — se nedenfor)
2. **Vælg coach** — grid af coach cards. Hvert kort viser avatar, navn, kort bio, antal matchende specialer i grøn ("3 ud af dine 5 valgte fokuspunkter matcher denne coach"). Klik på kortet → coach-detalje (specialer, achievements, bio, tilbage-knap). "Vælg coach" knap på kortet.
3. **Vælg varighed** — 30/45/60 min med note: "Jo flere fokuspunkter, desto længere tid anbefales. Coachen når kun det der er tid til."
4. **Vælg bane + layout** — dropdowns fra eksisterende `tracks.ts`
5. **Vælg tidspunkt** — månedskalender. Dage hvor coachen har ledige slots vises grønne. Klik dag → liste af mulige start-tidspunkter (genereret ud fra coachens availability og valgt varighed)
6. **Ekstra info** (textarea, valgfri)
7. **BOOK tid med {coach navn}** — opretter booking (status `pending`) og sender Discord PM til coachen

### Fokuspunkter (de 19)
Racing line · Brake points · Trail braking · Konsistens · Racecraft · Mentalt overskud · Setup-forståelse på basisniveau · Hvor tabes tiden? · Fejl i braking/turn-in · Race incidents · Kvalificering · Konsistens over stint · Track walk · Bilvalg · Strategi · Pit windows · Multiclass awareness · Fokusområder før race · Jeg er helt grøn og ønsker hjælp til "the basics"

Samme liste vises når en coach vælger sine specialer.

### Coach onboarding (`/coaching/min-profil`)
- Synlig for brugere med `coach` rollen
- Felter: bio (rich text), specialer (multi-select fra 19 fokuspunkter), achievements (liste)
- Tilgængelighed: ugentlige tilbagevendende slots ELLER specifikke dato-intervaller. UI: vælg dag → tilføj tidsrum (start–slut). Backend gemmer som `coach_availability` rows.

### Coach kalender (`/coaching/min-kalender`)
- Månedsoversigt. Dage med bookinger er grønne. Klik dag → liste af tidsrum med bookinger. Klik tidsrum → fuld booking-info (bruger, fokuspunkter, bane/layout, varighed, ekstra info, status).
- Knapper i detalje hvis status er pending: **Bekræft** (vælg Discord-kanal) eller **Afvis** (skriv begrundelse). Allerede besluttede vises read-only.

### Admin (`/admin/coaches`)
- Liste af alle brugere. Søg/filter. Toggle `coach` rolle.
- Oversigt over alle coaching-bookinger på tværs af coaches (read-only, til support).

## Discord-flow

### Når bruger booker
- Bot sender PM til coachen med: bruger-navn, fokuspunkter, varighed, bane/layout, ønsket tid, ekstra info
- Knapper i embed: **Bekræft** / **Afvis**
- Afvis → modal til begrundelse → status `rejected`, PM til bruger med begrundelse
- Bekræft → select menu med coach's tilgængelige stemme/tekst-kanaler → status `confirmed`, kanal gemmes → PM til bruger med dato/tid/kanal-link

### Påmindelse 2 timer før
- pg_cron job hvert 5. min kalder `/api/public/cron/coaching-reminders`
- Finder bookinger med `status = confirmed`, `starts_at` mellem `now()+1h55m` og `now()+2h5m`, hvor `reminder_sent_at` er NULL
- Sender PM til både coach og bruger, markerer `reminder_sent_at`

## Database

Nye tabeller (alle med GRANTs og RLS):

- **coach_profiles** (`user_id` PK→profiles, `bio`, `achievements` jsonb[], `specialties` text[], `active` bool, timestamps)
- **coach_availability** (`id`, `coach_user_id`, `weekday` 0-6 ELLER `specific_date`, `start_time`, `end_time`, timestamps) — recurring + ad hoc
- **coaching_bookings** (`id`, `coach_user_id`, `user_id`, `focus_points` text[], `duration_minutes`, `track`, `layout`, `starts_at` timestamptz, `extra_info`, `status` enum: pending/confirmed/rejected/completed/cancelled, `rejection_reason`, `discord_channel_id`, `reminder_sent_at`, `coach_notified_message_id`, timestamps)

Ny `app_role` enum-værdi: `coach`. Tilføj via migration.

RLS:
- `coach_profiles`: alle authenticated kan SELECT aktive profiler; ejer + admin kan opdatere
- `coach_availability`: alle authenticated kan SELECT; ejer + admin kan skrive
- `coaching_bookings`: bruger ser egne, coach ser hvor `coach_user_id = auth.uid()`, admin ser alle

## Server functions / routes
- `src/lib/coaching.functions.ts`: list coaches (med match-tæller), get availability slots for coach+date+duration, create booking, list mine bookinger (bruger), list mine bookinger (coach), update profile, update availability
- `src/lib/coaching-discord.server.ts`: send booking-PM, send bekræftelse-PM, send afvisning-PM, send reminder-PM, list bot-tilgængelige kanaler for coach
- `src/routes/api/public/discord.interactions.ts`: udvid eksisterende handler med coaching-knap/select-handlers (Bekræft / Afvis / kanal-valg / afvisning-modal)
- `src/routes/api/public/cron/coaching-reminders.ts`: 2-timers påmindelser
- pg_cron job tilføjes via migration (kalder reminder-endpoint hvert 5. min)

## Filer der oprettes
- `src/routes/coaching.index.tsx` — hero + landing
- `src/routes/coaching.book.tsx` — wizard
- `src/routes/_authenticated.coaching.min-profil.tsx` — coach profil-redigering
- `src/routes/_authenticated.coaching.min-kalender.tsx` — coach kalender
- `src/routes/_authenticated.coaching.mine-bookinger.tsx` — brugerens egne bookinger
- `src/routes/_authenticated._admin.admin.coaches.tsx` — admin-styring
- Komponenter: `CoachCard`, `CoachDetail`, `FocusPointPicker`, `DurationPicker`, `TrackLayoutPicker`, `CoachAvailabilityCalendar`, `CoachBookingCalendar`, `AvailabilityEditor`
- Lib: `coaching.functions.ts`, `coaching-discord.server.ts`, `coaching-focus-points.ts` (delt konstant-liste)
- Migrations for tabeller, role-enum, cron job
- i18n keys for alle nye tekster (8 sprog)

## Eksisterende filer der ændres
- `src/components/AppHeader.tsx` / burger-menu: tilføj "Coaching" link, + coach-only links når brugeren har rollen
- `src/routes/api/public/discord.interactions.ts`: nye custom_id handlers
- `src/routes/_authenticated._admin.tsx` (sidebar): tilføj "Coaches" admin-link
- `src/i18n/locales/*.json`: nye strenge

## Implementeringsrækkefølge
1. Migration: enum + 3 tabeller + cron + role
2. Server functions + Discord helpers
3. Coach-profil + availability UI
4. Booking-wizard UI
5. Bruger/coach booking-views
6. Discord interaction handlers + reminder cron
7. Admin coach-tildeling
8. Burger-menu + i18n
9. Smoke-test hele flowet
