# Nye teammedlemmer påvirker kun holdpoint fremadrettet

## Status i dag

Det virker allerede, når man bruger knappen "Tilføj kører" på et eksisterende lineup: køreren får et starttidspunkt, og holdets point for allerede afviklede afdelinger står uændret.

Der er to huller, hvor det ikke holder:

1. Hvis ejeren i stedet gemmer hele lineupet forfra (den almindelige tilmeldingsdialog), nulstilles starttidspunktet for **alle** kørere — også dem, der lige er kommet til. Så tæller en ny kører pludselig med i afdelinger, der allerede er kørt.
2. Hvis et team tilmelder sig ligaen **efter** at en eller flere afdelinger er afviklet, tæller hele lineupet med fra sæsonstart, selvom holdet slet ikke var med.

## Hvad der ændres

- En kører tæller altid først med fra det tidspunkt, han faktisk kommer på lineupet — uanset om det sker via "Tilføj kører" eller ved at gemme lineupet forfra.
- Kørere, der allerede stod på lineupet, beholder deres oprindelige starttidspunkt, når lineupet gemmes igen. De mister altså ikke deres historik.
- Et team, der tilmelder sig midt i sæsonen, tæller først med fra den førstkommende afdeling. Afdelinger afviklet før tilmeldingen giver holdet 0 point, som hvis de ikke var med — hvilket de ikke var.
- Tilmelder et team sig, før den første afdeling er kørt, ændres intet: hele lineupet tæller fra sæsonstart som hidtil.
- Ingen eksisterende data ændres, og ingen tidligere beregnede holdpoint flytter sig.

## Teknisk

Kun `src/lib/league-team-entries.functions.ts` (`submitTeamForLeague`) ændres. Ingen database- eller UI-ændringer; `src/lib/team-points.ts` og alle kaldesteder bruger allerede `effective_from`/`effective_until`.

- Læs eksisterende lineup-rækkers `effective_from` sammen med `user_id`, `status`, `effective_until` (linje ~140).
- Beregn ét `joinFrom`-tidspunkt for nye kørere:
  - Findes der mindst én afdeling i ligaen med resultater (afviklet før nu), er `joinFrom = nowIso`.
  - Ellers `joinFrom = null` (sæsonstart).
- Ved upsert af lineup-rækker (linje ~174-184):
  - Kørere der allerede fandtes: behold deres nuværende `effective_from` i stedet for at sætte `null`.
  - Nye kørere (inkl. i ikke-add-tilstand): sæt `effective_from = joinFrom`.
  - `effective_until: null` bevares som i dag, så en genaktiveret kører tæller igen fra nu.
- Samme `joinFrom`-logik gælder ved helt nye `league_team_entries`, så et team tilmeldt midt i sæsonen ikke får point for tidligere afdelinger.
