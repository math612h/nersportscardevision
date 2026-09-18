# Stewards skal kunne afgøre protester

## Hvorfor det ikke virker i dag

To ting spærrer:

1. **Adgang:** Selve afgørelsen kræver admin. Stewards kan se protestlisten og åbne en sag (det er tilladt i databasen), men når de trykker "Send afgørelse", afvises de med "Kun admins kan håndtere liga-resultater". Det samme gælder beskederne til parterne ("Kun admins kan sende afgørelser").

2. **En reel fejl for alle — også admins:** Fejlbeskeden på dit skærmbillede ("null value in column track…") kommer fra tiltrædelsespoint-rækkerne. Når en afgørelse gemmes, genskrives afdelingens resultater, og tiltrædelsesrækkerne oprettes uden banenavn, som er et krav. Derfor kan en pointstraf lige nu slet ikke gemmes på en afdeling, hvor nogen har tiltrædelsespoint.

## Det jeg laver

- Giv stewards lov til at afgøre protester og sende afgørelsen til parterne — præcis samme rettighed som admins, men kun for protester. Alt andet (liga-resultater, uploads, genberegning, bekræftelse) forbliver admin-only.
- Ret tiltrædelsesrækkerne, så de får bane og layout med, når de gemmes. Så kan både admins og stewards igen sende pointstraffe.

## Teknisk

- `src/lib/league-results.functions.ts`: ny hjælper `assertAdminOrSteward(userId)` (tjekker rollen `steward` ud over `admin`) og brug den **kun** i `applyProtestRuling`. Alle øvrige kald til `assertAdmin` er uændrede.
- `src/lib/protest-ruling-notify.functions.ts`: udvid rolletjekket i `notifyProtestRuling` til også at tillade `steward`.
- `syncStoredRaceRowsToLeagueResults`: joiner-insert mangler `track` (NOT NULL) og `layout`/`round`. Hent afdelingens `track`/`layout`/`round` (fra `divisions` eller en eksisterende `league_results`-række for afdelingen) og sæt dem på de indsatte rækker.
- Ingen databaseændringer nødvendige — RLS tillader allerede stewards at læse og opdatere protester, og afgørelsen kører via serverfunktion.

## Verifikation

- Typecheck.
- Genafspil en pointstraf på Afdeling 2 (Interlagos) i preview og bekræft at den gemmes uden fejl, og at stillingen stadig viser tiltrædelsespoint korrekt.
