# Dobbelte protester og sletning af protester

## Hvad der skete
Lars Andersens tre protester (Imola, 30. sep.) er oprettet med ca. 1 sekunds mellemrum og har samme tekst. "Indsend"-knappen bliver ved med at kunne trykkes, mens protesten gemmes, så hvert tryk opretter en ny protest.

## Det jeg laver
1. **Stop dobbelte protester**
   - "Indsend"-knappen låses og viser "Sender…", mens protesten gemmes.
   - Databasen afviser også en protest, hvis samme kører allerede har sendt en med samme tekst i samme afdeling inden for de sidste 10 minutter. Så kan det heller ikke ske fra en langsom forbindelse eller to faner.
2. **Slet protest (admins og stewards)**
   - Knappen "Slet protest" kommer på selve protestsiden i kontrolpanelet, med en bekræftelse.
   - Sletning koster ikke klageren noget: protesten forsvinder helt, så den tæller ikke som brugt protest-billet. Den påvirker heller ikke point eller straffe. En protest, der allerede er afgjort, kan ikke slettes, så straffe ikke bliver hængende.
   - De indklagede får en besked på hjemmesiden, en push-besked og en Discord-besked: "Protesten fra [afdeling], som du var indklaget i, er blevet fjernet uden følger for nogen af de involverede."
3. **Ryd op hos Lars:** De to ekstra protester slettes. Den ældste beholdes. Der sendes ingen besked om disse to, fordi det bare var dubletter.

## Teknisk
- `ProtestDialog` i `ligaer.$leagueId.afdeling.$divisionId.tsx`: `submitting`-state, knappen `disabled`, og tidligt return ved genindsendelse.
- Migration: BEFORE INSERT-trigger på `protests`, der kaster en fejl ved samme `submitted_by`, `division_id` og `description` inden for 10 min. Fejlbeskeden vises på dansk i UI'et.
- Ny `src/lib/protest-delete.functions.ts`: `deleteProtest` med `requireSupabaseAuth`, rolletjek for admin/steward og afvisning ved `status = 'ruled'`. Funktionen henter afdeling og indklagede, sletter `protest_involved` og derefter `protests` via admin-klienten, opretter `notifications` og sender push og Discord-DM best-effort. Hændelsen logges med `log_audit`.
- Protestsiden: knap med AlertDialog, invalidering af `protests-admin` og navigation tilbage til listen.
- Dataoprydning: sletning af `57f00673…` og `6dbd45df…` inkl. deres `protest_involved`-rækker.

## Verifikation
- Typecheck. Dobbeltklik på "Indsend" skal give én protest.
- Slet en testprotest som steward, og tjek at den indklagede får beskeden.
