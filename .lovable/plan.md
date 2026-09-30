# Tæl LMP2 ELMS-tider med ved LMP2-tilmelding

## Hvad der er galt

ICE Cup's LMP2-klasse hedder "LMP2" på hjemmesiden (med bilen Oreca 07 ELMS). Men tider kørt i ELMS-udgaven gemmes på leaderboardet som klassen "LMP2 ELMS". Tilmeldingen tæller kun tider i præcis "LMP2", så Sanders ELMS-tider bliver slet ikke talt med. Derfor står der 0.

Sander har 8 tider i LMP2 ELMS: Laguna Seca (4), Silverstone, Bahrain, Paul Ricard og Road Atlanta. Kravet er mindst 10 tider. Selv når fejlen er rettet, mangler han altså 2 tider mere, før han kan tilmelde sig. Hans 3 Hypercar-tider tæller ikke med.

## Det jeg laver

1. **LMP2 og LMP2 ELMS tæller som én klasse ved tilmelding.** Det gælder begge veje: vælger man LMP2 eller LMP2 ELMS, tæller alle ens tider fra begge klasser med.
2. **Sikkerhedstjekket i databasen**, der afviser tilmeldinger med under 10 tider, følger samme regel, så de to tjek aldrig er uenige.
3. Fejlbeskeden kommer til at vise det rigtige antal. For Sander bliver det 8.
4. **Leaderboardet er uændret.** Hver tid står stadig som enten LMP2 eller LMP2 ELMS, præcis som i dag.

Kravet om mindst 10 tider er uændret, og det samme gælder alle andre klasser.

## Teknisk

- `src/routes/ligaer.$leagueId.index.tsx` (~L1458): hvis den valgte klasse er `LMP2` eller `LMP2_ELMS`, bruges `.in("car_class", ["LMP2","LMP2_ELMS"])`, ellers `.eq` som i dag.
- Migration: `enforce_min_leaderboard_times()` tæller med `car_class = ANY(CASE WHEN NEW.car_class IN ('LMP2','LMP2_ELMS') THEN ARRAY['LMP2','LMP2_ELMS'] ELSE ARRAY[NEW.car_class] END)`.
- Ingen dataændringer. `leaderboard_times.car_class` og leaderboardets visning røres ikke.
