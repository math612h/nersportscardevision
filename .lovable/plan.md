# Plan

## 1. "Besked om navn er sendt"-indikator

**Hvor:** Admin-flader hvor `sendAdminTemplateMessage` med template `wrong_name` kan trigges (typisk `_authenticated._admin.admin.afventer.tsx` og evt. brugerlisten).

- Ny tabel `admin_message_log` (user_id, template, sent_by, sent_at) — eller genbrug `notifications.created_at` med filter på title.
  - Vælger: ny lille tabel `admin_message_log` — renere og uafhængig af notification-titel.
- `sendAdminTemplateMessage` skriver en række hver gang.
- Server-fn `getAdminMessageStatus({userIds, template})` returnerer seneste sent_at pr. bruger.
- UI: knappen viser "Sendt {relativ tid} – send igen" når der findes en log-række; ellers normal tekst.

## 2. Fjern auto-kategori-begrænsning + krav om 10 leaderboard-tider

- Fjern brug af `allowed_categories_for_signup` i tilmeldings-UI: vis alle kategorier i klassen igen.
  - Behold DB-funktionen (ikke-destruktivt) — den kaldes bare ikke længere.
- Tilføj guard i tilmeldings-flow + i `entries` INSERT-policy/trigger:
  - Tæl `leaderboard_times` for `user_id` (alle klasser eller samme klasse?). **Vælger: samme `car_class`** — det er det, der er relevant for splittet og ratingen.
  - Hvis < 10 → fejl: "Du skal have mindst 10 registrerede tider i [klasse] før du kan tilmelde dig."
- Trigger på `entries` BEFORE INSERT der validerer dette server-side, så hverken UI eller admin-bypass kan omgå det utilsigtet (admin-tilføj kan dog skippe via `SECURITY DEFINER` server-fn).

## 3. "Opdel feltet i Pro & Am"-knap

**Hvor:** Liga-redigering (admin), pr. klasse-config der har kun én `driver_category`.

**Algoritme (server-fn `splitClassIntoProAm`):**
1. Hent alle ikke-waitlist entries for (league_id, car_class).
2. For hver kører: `score = 0.7 * elo_normalized + 0.3 * leaderboard_normalized`
   - ELO: `user_ratings.score` (default 1500 hvis mangler), normaliseret til 0-100 via percent_rank inden for feltet.
   - Leaderboard: brugerens bedste lap i klassen vs feltets median (samme formel som `compute_user_class_score` men kun inden for feltets kørere), 0-100.
3. Sortér kørere efter score desc.
4. Find optimalt split-indeks `k` (1 ≤ k ≤ n-1):
   - `balance_score = 1 - |k - n/2| / (n/2)` (1 når lige store, 0 ved kant)
   - `gap_score`: størrelsen af gap mellem score[k-1] og score[k] normaliseret mod max gap i feltet (0-1)
   - `total = 0.35 * balance_score + 0.65 * gap_score`
   - Vælg k med højeste total.
5. Top k → "Pro", resten → "Am".
6. Opdater:
   - `leagues.class_configs`: erstat den ene config med to (Pro + Am), genbrug `number_from/to` (fx split intervallet i to halvdele) eller behold samme interval for begge — **vælger: behold samme interval**, admin kan justere bagefter.
   - `entries.driver_category` opdateres til "Pro"/"Am" for hver kører.
7. Direkte opdeling (ingen preview) — toast viser fx "12 i Pro, 13 i Am".

**Knap-betingelse:** Vis kun når klassen har præcis én `driver_category` og mindst 2 entries.

## 4. "Tilføj bruger til liga"-knap

**Hvor:** Admin liga-side (entries-view eller liga-oversigt).

- Dialog: søg bruger (`profiles.display_name` ilike), vælg liga (allerede kendt fra context), vælg klasse-config (samme dropdown som `EntryDialog`), vælg bilnummer (samme grid som `MoveEntryDialog`).
- Server-fn `adminAddEntry` (kræver admin via `has_role`): bypasser 10-tider-check, indsætter direkte i `entries`.

## 5. ELO på tværs af kategorier inden for samme bilklasse

- Opdater `recompute_all_elo()`:
  - Skift `GROUP BY league_id, round, car_class` til `GROUP BY league_id, round, car_class` (uændret — bilklasse er allerede grupperingsnøglen).
  - **Verificér** at den nuværende inner-loop ikke filtrerer på `driver_category`. Den nuværende funktion gør det allerede ikke — alle med samme `car_class` indgår. **Konklusion:** Funktionen er sandsynligvis allerede korrekt; jeg verificerer ved at læse den og bekræfter. Hvis det viser sig at trigger/entry-query filtrerer kategori et sted, fjerner jeg det.
- Kør `recompute_all_elo()` én gang efter migration for at sikre konsistens.

## Tekniske detaljer

**Nye filer:**
- `src/lib/admin-messages-log.functions.ts` — `getAdminMessageStatus`
- `src/lib/league-split.functions.ts` — `splitClassIntoProAm`
- `src/lib/league-admin-entries.functions.ts` — `adminAddEntry`, `searchUsers`

**Migrationer:**
1. `admin_message_log` tabel (+ GRANTs + RLS: admin read, service_role all)
2. Trigger på `entries` BEFORE INSERT for 10-tider-krav (med bypass for admin via `SECURITY DEFINER` server-fn der ikke kalder triggeren? — bedre: tjek i triggeren om `current_setting('request.jwt.claims', true)` indeholder admin-rolle, og spring over). Alternativ: kald `set_config('app.bypass_entry_limit','on',true)` i admin-server-fn.
3. Kør `recompute_all_elo()` (efter at have læst og evt. justeret funktionen).

**UI ændringer:**
- `src/routes/_authenticated._admin.admin.afventer.tsx` (eller hvor wrong_name sendes fra) — vis status.
- Tilmeldings-flow: fjern `allowed_categories_for_signup`-kald.
- Admin liga entries-side: ny "Opdel"-knap + ny "Tilføj bruger"-knap.

## Rækkefølge
1. Migration 1 (admin_message_log) → skriv server-fn + UI for status
2. Migration 2 (10-tider trigger) → fjern auto-kategori i tilmelding
3. Server-fn + UI for split-knap
4. Server-fn + UI for tilføj-bruger
5. Læs `recompute_all_elo`, juster hvis nødvendigt, kør recompute
