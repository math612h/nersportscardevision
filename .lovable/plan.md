# LMU-Hub – Implementeringsplan

Sim-racing platform med to sider: **admin** (arrangører styrer ligaer, afdelinger, regler, tilmeldinger og protests) og **deltager** (kørere ser ligaer, tilmelder sig, indsender protests, læser regler). Bygges på TanStack Start + Lovable Cloud med email/Google login og delt database.

## Datamodel (Lovable Cloud)

```text
profiles            (id=auth.uid, display_name, created_at)
user_roles          (user_id, role: 'admin' | 'racer')
leagues             (id, name, description, banner_url, created_by, created_at)
divisions           (id, league_id, name, car_class, driver_category,
                     track, layout, race_date, settings_json, created_at)
                     -- settings_json: weather, tid, length, BoP, pit-window osv.
entries             (id, division_id, user_id, driver_name, car_class,
                     driver_category, status: 'pending'|'approved'|'rejected', created_at)
rulesets            (id, league_id, title, content, sort_order, created_at)
protests            (id, division_id, submitted_by, lap_number, corner,
                     involved_drivers, description, video_url, created_at)
```

Én liga indeholder X afdelinger, hver afdeling har egne settings (bane, layout, dato, vejr, BoP osv.). Tilmeldinger og protests er pr. afdeling.

## Roller & RLS

Separat `user_roles` tabel + `has_role(uid, role)` security-definer funktion.
- Første bruger der opretter konto bliver automatisk admin (eller manuelt seedet).
- Admin: fuld CRUD på ligaer, afdelinger, regler. Kan godkende entries, læse alle protests.
- Racer (alle authenticated): SELECT på leagues/divisions/rulesets, INSERT egne entries og protests, SELECT/UPDATE/DELETE kun egne entries/protests.

## Sidestruktur

### Offentlige ruter
- `/login` – Email/password + "Log ind med Google"
- `/reset-password` – Sæt nyt password efter recovery-mail

### Deltager (`_authenticated/`)
- `/` – Deltager-dashboard: liste over alle ligaer (kort med banner + beskrivelse)
- `/ligaer/$leagueId` – Ligaens præsentation + liste af afdelinger
- `/ligaer/$leagueId/afdeling/$divisionId` – Detaljer: bane/layout/dato/settings, "Tilmeld dig"-knap, deltagerliste, "Indsend protest"-knap
- `/ligaer/$leagueId/regler` – Regelsæt for ligaen
- `/mine-tilmeldinger` – Egne entries på tværs af ligaer
- `/mine-protests` – Egne indsendte protests

### Admin (`_authenticated/_admin/`)
- `/admin` – Admin-hub med genveje (4 kort: Ligaer, Kalender, Entries, Regler)
- `/admin/ligaer` – Liste + opret/rediger/slet liga
- `/admin/ligaer/$leagueId/afdelinger` – CRUD afdelinger med settings-form
- `/admin/ligaer/$leagueId/entries` – Alle tilmeldinger, auto-grupperet efter klasse→kategori, godkend/afvis/slet
- `/admin/ligaer/$leagueId/regler` – CRUD regelsæt
- `/admin/protests` – Alle indsendte protests

## Moduler

**Kalender (afdelinger):** Bane-dropdown (hardcoded LMU-baner med layouts: Spa, Le Mans, Monza, Bahrain, Imola, Fuji, Sebring, Portimão osv.), dato-picker, settings (vejr, sessionslængder osv.). Vises som sorteret liste pr. liga.

**Entry-liste:** Form med kørernavn, bilklasse (Hypercar/LMP2/LMGT3), kategori (Pro/Silver/Bronze/Am). Visning auto-grupperet efter klasse→kategori. Admin kan slette; racer kan kun slette egne.

**Regelsæt:** Titel + multi-linje tekst, sorterbar liste pr. liga. Vises som accordion for deltagere.

**Protests:** Form med afdeling, omgang, sving, involverede kørere (text), beskrivelse, video-link (URL, valideret). Pr. liga/afdeling. Admin ser alle, racer kun egne.

## Validering

Alle forms bruger zod + react-hook-form med tegn/længde-grænser. Video-link valideres som URL. Tekstfelter har max-længder.

## Design

Mørkt motorsport-tema, rød accent. Semantiske tokens i `src/styles.css` (oklch). shadcn/ui komponenter. Mobile-first (testet 390px). Dansk UI gennemgående.

## Filer der oprettes

- `src/routes/login.tsx`, `reset-password.tsx`
- `src/routes/_authenticated.tsx` (auth-gate)
- `src/routes/_authenticated/index.tsx` (deltager-dashboard)
- `src/routes/_authenticated/ligaer.$leagueId.tsx` osv.
- `src/routes/_authenticated/_admin.tsx` (rolle-gate)
- `src/routes/_authenticated/_admin/...` (admin-ruter)
- `src/lib/*.functions.ts` – server functions for alle CRUD-operationer (med `requireSupabaseAuth`)
- `src/lib/tracks.ts` – LMU banedata
- `src/components/AppHeader.tsx`, `LeagueCard.tsx`, `DivisionCard.tsx`, `EntryForm.tsx`, `ProtestForm.tsx` osv.

## Implementeringsrækkefølge

1. Aktivér Lovable Cloud, opret tabeller + RLS + roller
2. Auth: login, reset-password, root onAuthStateChange
3. Admin-flow: ligaer → afdelinger → regler
4. Deltager-flow: se ligaer/afdelinger/regler
5. Tilmeldinger (begge sider)
6. Protests (begge sider)
7. Design-polish

## Åbne spørgsmål (kan afklares senere)

- Skal første registrerede bruger automatisk være admin, eller seedes du manuelt?
- Skal admin godkende tilmeldinger (pending→approved), eller er de aktive med det samme?
