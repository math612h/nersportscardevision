# Tilføj kørere til et team-lineup midt i sæsonen

## Svar på dine spørgsmål

**1. Kan en fra ventelisten sættes på et team-lineup?**
Ja. Systemet kræver kun, at køreren er tilmeldt ligaen i den rigtige klasse og er medlem af teamet i samme klasse — ventelistestatus blokerer ikke. Det beholder vi.

**2. Hvad sker der, hvis en fra lineupet ikke deltager i et løb?**
Teamets placering i et løb er medianen af de lineup-kørere, der faktisk kørte. En der ikke møder op (DNS/ingen placering) tælles slet ikke med og trækker altså ikke medianen ned. Men mindst 2 fra lineupet skal have kørt løbet, ellers får teamet 0 point i den afdeling.

**3. Tæller en ny kører med i tidligere afdelinger?**
Nej — det er netop det, der skal rettes. I dag beregnes teamets median ud fra lineupet som det ser ud *lige nu*, også for afdelinger der allerede er kørt. Tilføjer man en kører midt i sæsonen, ville vedkommendes tidligere resultater pludselig indgå i teamets gamle afdelinger. Det stopper vi: en kører tæller først med fra og med den afdeling, hvor han bliver tilføjet.

## Hvad der ændres

- På teamsiden får hver team-tilmelding en knap "Tilføj kører", der åbner tilmeldingsvinduet med liga, klasse og nuværende lineup låst.
- Ejeren kan sætte flueben ved yderligere teammedlemmer og gemme. Allerede tilmeldte kørere kan ikke fjernes (kræver admin), så kørte afdelinger ikke påvirkes.
- Det virker hele sæsonen igennem, også efter første afdeling.
- Nye kørere markeres med den afdeling, de gælder fra (næste ikke-afviklede afdeling), og indgår kun i teamets resultater fra og med den. Alle tidligere afdelingers team-medianer og -point står uændret.
- Ved den allerførste tilmelding gælder kørerne fra afdeling 1 som hidtil.
- Nye kørere tilføjes som accepteret med det samme og får besked, som ved første tilmelding.

## Teknisk

**Database (migration)**
- Ny kolonne `league_team_lineup.effective_from_round integer` (nullable; NULL/1 = fra sæsonstart).
- Sættes af serverfunktionen ved tilføjelse midt i sæsonen: `max(round)` blandt afdelinger med resultater i ligaen + 1.

**Server**
- `src/lib/league-team-entries.functions.ts` → `submitTeamForLeague` får `mode: "add"`:
  - sletter ingen eksisterende lineup-rækker,
  - validerer union af eksisterende + nye kørere ≥ 2,
  - beholder al øvrig validering (ejer/admin, teammedlem i samme klasse, tilmeldt liga+klasse, ikke låst til andet team),
  - upserter kun nye kørere som `accepted` med beregnet `effective_from_round`,
  - sætter entry til `confirmed` når totalen er ≥ 2.

**Pointberegning**
- `src/lib/team-points.ts`: `LineupTeamInfo.userIds` udvides til `members: Array<{ userId, effectiveFromRound }>`, og `computeTeamRacePoints` får et `round`-argument; kun medlemmer med `effectiveFromRound <= round` indgår i medianen og i ≥2-kravet.
- Kaldstederne opdateres til at sende afdelingens round og hente `effective_from_round` med i lineup-forespørgslen:
  - `src/routes/ligaer.$leagueId.afdeling.$divisionId.tsx`
  - `src/routes/index.tsx` (samlet team-stilling pr. afdeling)
  - liga-siden `src/routes/ligaer.$leagueId.index.tsx`, hvis den aggregerer team-point pr. runde.
- Broadcast-feedet `src/routes/api/public/broadcast/team-lineups.ts` returnerer `effectiveFromRound` pr. kører.

**UI**
- `src/components/TeamLeagueSignupDialog.tsx`: ny prop `existingEntry` (entryId, leagueId, carClass, lockedUserIds) → låst liga/klasse, forudvalgte og deaktiverede eksisterende kørere, knaptekst "Tilføj kørere", og springer `takenCombos`-filtreringen over.
- `src/components/LeagueTeamSignupCard.tsx`: knap pr. entry der åbner dialogen i denne tilstand, og viser "fra afdeling N" ved kørere tilføjet undervejs.
