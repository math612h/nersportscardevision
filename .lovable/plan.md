# Skjul afbud for andre kørere

Afbud skal kun kunne ses i aktivitetsloggen (admin). Andre kørere og besøgende må ikke se, hvem der har meldt fra.

## Hvad ændres
- **Afdelingssiden:** "Deltager ikke"-mærket, den overstregede/gråtonede række og antallet af afbud vises kun for admins. Alle andre ser deltagerlisten, som om ingen har meldt fra.
- **Din egen status:** Den kører, der har meldt fra, kan stadig se sit eget afbud og fortryde det.
- **Begrundelser:** Vises allerede kun for admin og kørerens egen række (uændret).
- **Aktivitetsloggen:** Uændret, viser fortsat alle afbud.

## Teknisk
- Fjern offentlig læseadgang til `division_absences_public` (view'et) for anon/authenticated via migration, så data ikke kan hentes udenom siden. Kun admin/ejer læser via eksisterende RLS på `division_absences`.
- I `ligaer.$leagueId.afdeling.$divisionId.tsx`: hent afbud fra `division_absences` (RLS giver admin alle, kører kun egen) i stedet for det offentlige view; `absentCount` og badges bygger på det.
- Tjek andre steder der bruger `division_absences_public` (forside/Race Day Cockpit, reserver) og tilpas, så reserve-flowet stadig virker via serverfunktioner.
