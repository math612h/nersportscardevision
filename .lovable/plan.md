# Tilføj kørere til et team-lineup midt i sæsonen

## Svar på dine spørgsmål

**1. Kan en fra ventelisten sættes på et team-lineup?**
Ja. Systemet kræver kun, at køreren er tilmeldt ligaen i den rigtige klasse og er medlem af teamet med den klasse — ventelistestatus blokerer ikke. Det beholder vi som ønsket.

**2. Hvad sker der, hvis en fra lineupet ikke deltager i et løb?**
Teamets placering i et løb er medianen af de lineup-kørere, der faktisk kørte. En kører, der ikke møder op (DNS/ingen placering), tælles slet ikke med — han trækker altså ikke medianen ned. Men mindst 2 fra lineupet skal have kørt løbet, ellers får teamet 0 point i den afdeling. Så et lineup på 2, hvor den ene udebliver, giver 0 point.

## Hvad der ændres

I dag kan et team kun tilmeldes én gang pr. liga og klasse, og bagefter forsvinder den kombination fra tilmeldingsvinduet — der er ingen måde at tilføje en kører på.

- På teamsiden får hver team-tilmelding en knap "Tilføj kører", der åbner tilmeldingsvinduet med ligaen, klassen og det nuværende lineup låst/forudvalgt.
- Ejeren kan sætte flueben ved yderligere teammedlemmer og gemme. De allerede tilmeldte kørere kan ikke fjernes (fluebenene er låst), så kørte afdelinger og point ikke kan påvirkes.
- Det virker uanset om ligaen er i gang — tilføjelser er tilladt hele sæsonen.
- Nye kørere tilføjes som accepteret med det samme og får en besked, præcis som ved den første tilmelding.
- Fjernelse midt i sæsonen er ikke muligt for ejeren; det kræver en admin.

## Teknisk

- `src/components/TeamLeagueSignupDialog.tsx`: ny valgfri prop `existingEntry` (entryId, leagueId, carClass, lockedUserIds). I den tilstand: liga/klasse-vælgere låst, allerede tilmeldte kørere forudvalgte og deaktiverede, knaptekst "Tilføj kørere". `availableLeagues`/`availableClasses`-filtreringen (takenCombos) springes over i denne tilstand.
- `src/components/LeagueTeamSignupCard.tsx`: render dialogen pr. entry med `existingEntry` og de accepterede `user_id`'er som låste.
- `src/lib/league-team-entries.functions.ts` → `submitTeamForLeague`: tilføj valgfrit `mode: "add"`. I add-mode
  - slettes ingen lineup-rækker (drop `.delete().not("user_id","in",...)`),
  - kræves union af eksisterende + nye kørere ≥ 2 i stedet for at validere kun de indsendte,
  - beholdes al øvrig validering (teamejer/admin, medlem af teamet med samme klasse, tilmeldt liga+klasse, ikke låst til et andet team),
  - upsertes kun de nye kørere som `accepted`, og entry sættes til `confirmed` når totalen er ≥ 2.
- Ingen databaseændringer nødvendige; RLS og eksisterende triggere dækker allerede tilfældet (serverfunktionen kører med admin-klient efter ejer-tjek).
