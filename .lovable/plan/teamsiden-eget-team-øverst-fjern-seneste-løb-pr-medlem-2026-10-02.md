# Teamsiden: eget team øverst + fjern "Seneste løb pr. medlem"

## 1. Eget team vises øverst på team-oversigten

I `src/components/TeamsHub.tsx`:

- Hent den indloggede brugers medlemskaber fra `team_members` (kun når man er logget ind).
- Sortér listen, så de teams man er medlem af, vises først — resten forbliver alfabetisk som nu.
- Søgningen virker uændret; sorteringen gælder kun rækkefølgen.
- Er man ikke logget ind, ændrer intet sig.

## 2. Fjern "Seneste løb pr. medlem" fra teamsiden

I `src/routes/teams.$teamId.tsx`:

- Fjern visningen af kortet "Seneste løb pr. medlem" (både renderingen og selve `RecentResultsCard`-komponenten).
- Kun visningen fjernes — ingen data, resultater eller pointberegninger røres.

## Tekniske detaljer

- Ingen databaseændringer.
- Ingen ændringer i eksisterende funktioner (tilmelding, lineups, invitationer osv.).
- Gælder både `/teams` og `/lmu/teams` (de bruger samme komponent).
