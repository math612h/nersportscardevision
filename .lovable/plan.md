# Fjernede kørere dukker op igen efter genindlæsning

## Bekræftet årsag

Fjernelsen gemmes korrekt. Databasen viser Kenneth (fjernet 19. sep.) og Daniel (fjernet 21. sep.) som fjernet fra Odyssés LMGT3-lineup. Den offentlige side kører også den nyeste udgave.

Fejlen ligger på teamsiden. To dele af siden henter lineupet under præcis samme navn i browserens hukommelse:

- **Lineup-kortet** henter kørerne *inklusive* datoen for, hvornår de blev fjernet.
- **Tilføj/rediger lineup-vinduet** (der findes én gang pr. tilmelding og én gang øverst) henter de samme kørere *uden* den dato.

Den, der svarer sidst, overskriver den anden. Lige efter et klik vinder kortet, så alt ser rigtigt ud. Ved genindlæsning vinder vinduet ofte. Så mangler fjernelsesdatoen, og alle tidligere kørere vises som aktive igen. Det forklarer præcis "de bliver fjernet, men efter reload er de tilbage".

## Rettelse

1. **Adskil de to hentninger:** Vinduet får sit eget navn til sine data, så det aldrig kan overskrive lineup-kortet.
2. **Vinduet henter også fjernelsesdatoen,** så det heller ikke selv tror, at fjernede kørere stadig er på lineupet.
3. Ingen ændringer i databasen, pointberegningen eller historikken. Kenneth og Daniel forbliver fjernet fra LMGT3, og deres tidligere team-point bevares.

## Kontrol

- Åbn Odyssés teamside som teamejer, og genindlæs flere gange. Kenneth og Daniel må kun stå under "Tidligere lineup" i LMGT3.
- Kontrollér, at Kenneth kan tilføjes til LMP2-lineupet.
- Udgiv rettelsen til lmudanmark.dk med det samme bagefter, så Daniel kan gennemføre flytningen.

## Teknisk

- `src/components/TeamLeagueSignupDialog.tsx`: query-nøglen `["team-league-entries", teamId]` skifter til `["team-league-entries-dialog", teamId]`. `select` får `effective_from, effective_until`. Invalidering efter submit dækker både dialogens og kortets nøgle.
- `LeagueTeamSignupCard.tsx` bevarer nøglen `["team-league-entries", teamId]` og sin nuværende select, der allerede filtrerer korrekt på `effective_until`.
