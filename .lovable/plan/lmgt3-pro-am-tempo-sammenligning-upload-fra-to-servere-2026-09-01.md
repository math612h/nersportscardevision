# LMGT3 Pro/Am tempo-sammenligning + upload fra to servere

To ting: et nyt admin-værktøj der sammenligner LMGT3-tempo på tværs af Pro- og Am-serverens racefiler, og mulighed for at uploade resultatfiler fra begge servere på stillinger-siden.

## 1. Ny admin-side: "Pro/Am tempo-sammenligning"

Ny side i kontrolpanelet (link i admin-menuen). Alt kører i browseren — ingen data gemmes i databasen.

Upload-felter:
- Racefil fra PRO-serveren (LMGT3 Pro + LMP2)
- Racefil fra AM-serveren (LMGT3 Am)

Begge filer kan uploades hver for sig; sammenligningen vises når mindst én er indlæst, og er komplet når begge er der.

Behandling:
- Kun kørere i klassen LMGT3 medtages. LMP2 (og alle andre klasser) ignoreres helt.
- Hver kører mærkes PRO eller AM ud fra hvilken fil de kom fra, og hvilken fil/server vises i tabellen.
- Alle omgange for hver kører hentes. Kun gyldige omgange tælles med — omgange uden gyldig tid (`--.----`, tomme eller ikke-numeriske) frasorteres altid.
- Gyldige omgange sorteres hurtigste → langsomste; de 10 hurtigste udvælges.
- Median af de 10 = gennemsnittet af 5. og 6. hurtigste.
- Pro- og Am-kørere samles i én liste sorteret på median (hurtigst først).
- Endurance-filer med førerskift: omgange fordeles til den rigtige kører via de eksisterende `<Swap>`-intervaller, så hver kører får sin egen liste.

Kørere med færre end 10 gyldige omgange:
- Vises stadig, men uden median, markeret "Utilstrækkeligt datagrundlag", placeret nederst uden placeringsnummer og uden for rangeringen.

Tabellen viser:
Placering · Navn · Bilnummer · Klasse (PRO/AM) · Server/filnavn · Hurtigste gyldige omgang · Median af de 10 · Antal gyldige omgange · Forskel til hurtigste median.

Tider vises som `1:59.437`, forskelle som `+0.638`. Hver række kan foldes ud og viser de 10 konkrete omgangstider (med omgangsnummer) sorteret hurtigste → langsomste.

Værktøjet foreslår ikke klasseskift — det viser kun tallene neutralt.

## 2. Upload af race-/qualifikationsfiler fra begge servere

På liga-stillingssiden, hvor race- og quali-filer uploades i dag, bliver upload-knappen til to knapper:
- "Upload fra PRO-server"
- "Upload fra AM-server"

Begge filer kan uploades efter hinanden til samme afdeling og samme session (race eller quali). Anden fil overskriver ikke den første — kørere fra begge filer matches mod grid'et og udfylder hver deres rækker. Statusteksten viser hvilke filer der er indlæst, og hvor mange kørere hver fil matchede. Fastest-lap beregnes pr. klasse på tværs af de indlæste filer, så Am-klassen får sin egen fastest lap.

## Teknisk

- `src/lib/lmu-parser.ts`: `ParsedDriver` udvides med `carNumber` og `validLaps` (nummer + tid i ms) — de rå omgange bliver allerede læst, de kastes bare væk i dag. `computeStints` genbruges til at fordele omgange pr. kører ved førerskift. Ingen ændring i eksisterende adfærd for leaderboard/companion-upload.
- Ny ren funktion `src/lib/pace-comparison.ts` med udvælgelse af top-10, medianberegning og sortering + unit-tests (top-10, færre end 10, ugyldige omgange, førerskift).
- Ny route `src/routes/_authenticated._admin.admin.pace-sammenligning.tsx` + menupunkt i `AdminSidebar`.
- `src/routes/_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx`: `importXml` tager et server-argument (`pro` | `am`), akkumulerer importstatus pr. fil i stedet for at nulstille, og beregner fastest lap ud fra de samlede parsede kørere.
- Ingen databaseændringer.
