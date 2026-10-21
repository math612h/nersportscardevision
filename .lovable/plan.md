# Jens færdiggøres + Sander Rechnagel vises under det forkerte team

## Sander Rechnagel (bekræftet i databasen)

- Sander blev fjernet fra Odyssé Cronos Racings LMP2-lineup den 3/10 og blev sat på **Weitechs** LMP2-lineup den 19/10. Lineuppet er altså korrekt, og hans resultater tæller for Weitech fra den 19/10.
- Men hans ligatilmelding har stadig **"Odyssé Cronos Racing"** som team. Det felt bliver aldrig opdateret, når man flyttes mellem lineups, og det er derfor siden viser Odyssé ved hans navn.
- Samme fejl rammer **Stefan Davidsen** (står på N2S Racings lineup, men tilmeldingen har intet team). Andre er der ikke.

## Plan

1. **Ret Sander og Stefan nu**: deres tilmelding får samme team som det lineup, de er aktive på (Sander → Weitech, Stefan → N2S Racing). Point og holdpoint fra tidligere afdelinger ændres ikke, fordi de beregnes ud fra lineup-perioderne.
2. **Ret koden**: når en kører bliver aktiv på et team-lineup (tilføjet eller accepteret), sættes tilmeldingens team automatisk til det team. Fjernes køreren fra lineuppet, nulstilles teamet, hvis det stadig peger på det team, køreren blev fjernet fra.
3. **Jens: send Discord-beskeden**, som han mangler (han har allerede fået den på siden).
4. **Kontrol af Jens' rettelse**: åbn Fuji i stillingseditoren, gem uden ændringer, og bekræft at Jens stadig står som P11/18 point og ikke bliver meldt ud. Kontrollér også, at Sander vises under Weitech på liga-, team- og afdelingssiderne.
5. **Udgiv** til lmudanmark.dk, så rettelsen i editoren er live og ingen kommer til at gemme Fuji med den gamle fejl.

## Teknisk

- Datafix (`entries.team_id`): Sanders entry `226d20e2-…` → Weitechs team-id (via `league_team_entries`); Stefans aktive LMP2-entry → N2S Racings team-id.
- Kode: `src/lib/league-team-lineup.server.ts` og `src/lib/league-team-entries.functions.ts`. Når en lineup-række bliver aktiv (accepted, `effective_until IS NULL`), køres en update på kørerens aktive primære entry i samme liga+klasse (`team_id = league_team_entries.team_id`). Ved fjernelse (`removeLineupMembers`) sættes `team_id = null`, hvis det matcher det fjernede team.
- Jens' DM via den eksisterende `sendAdminDirectMessage` (Playwright med admin-session).
- Ingen migration.
