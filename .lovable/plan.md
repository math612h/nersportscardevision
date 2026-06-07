## Mål

1. **Én samlet rating pr. bruger pr. bilklasse** (ELO-agtigt på tværs af alle ligaer på platformen) — ikke længere pr. liga.
2. **Farve på rating-badge** bestemmes af brugerens percentil i den klasse:
   - Top 5% → **Blå**
   - Top 25% → **Guld**
   - Top 50% → **Sølv**
   - Resten → **Bronze**
3. **På entry-listen** vises kun den klasse-rating der matcher det entry brugeren er tilmeldt (er du i LMGT3, vises din LMGT3-rating).
4. **Arkivet flyttes til Leaderboard-siden** som en "Personal bedst"-knap/tab, så enhver bruger kan få indblik i sine PB'er der.

---

## Plan

### 1. Database
Ny tabel `user_class_ratings (user_id, car_class, score, percentile, confidence, components, updated_at)` med unique `(user_id, car_class)`.

Nye/ændrede funktioner:
- `compute_user_class_score(_user_id, _car_class)` — samme 20/80 leaderboard/results-formel som i dag, men aggregerer på tværs af **alle** ligaer.
- `refresh_user_class_rating(_user_id, _car_class)` — opdaterer score + udregner percentil ift. alle brugere i klassen.
- `refresh_class_percentiles(_car_class)` — recompute percentiles for hele klassen (kaldes efter writes).
- Triggers på `leaderboard_times`, `league_results`, `entries` refaktoreres til at kalde class-versionen.

Den gamle `user_league_ratings` beholdes midlertidigt så `allowed_categories_for_signup` ikke knækker — opdateres til at læse fra `user_class_ratings` i samme migration.

### 2. RatingBadge
- Tilføj `percentile` prop.
- Ny farveskala: `>=95 → blå`, `>=75 → guld`, `>=50 → sølv`, ellers `bronze`.
- Bevarer score-tal + tooltip; tilføjer percentil i tooltip.

### 3. Visning
- **Entry-listen** (`ligaer.$leagueId.index.tsx`): slå rating op pr. (user_id, car_class) ud fra entryens egen `car_class`.
- **Profil** (egen + `/profil/$userId`): vis liste af ratings pr. klasse brugeren har data i.
- **Brugere-listen**: vis hver brugers højeste klasse-rating (eller alle, kompakt).

### 4. Leaderboard ↔ Arkiv
- Tilføj knap/tab "Personal bedst" på `/leaderboard`, som åbner samme indhold som `/arkiv` (best tider + udviklingsgraf + liga-historik) for den indloggede bruger.
- Eksisterende `/arkiv` route bevares og linker bare derhen, så ingen links knækker.

---

## Teknisk

- Migration kører `refresh_user_class_rating` for alle eksisterende `(user_id, car_class)` kombinationer + initial percentil-beregning.
- Percentil opbevares i tabellen (ikke beregnet on-the-fly) for hurtig listevisning.
- `getMyArchive` genbruges som-er på leaderboard-siden via en ny tab.

Sig til hvis du vil have det udført.