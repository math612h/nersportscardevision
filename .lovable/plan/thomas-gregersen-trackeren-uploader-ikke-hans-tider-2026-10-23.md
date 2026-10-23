# Thomas Gregersen – trackeren uploader ikke hans tider

## Hvad jeg har fundet
- Trackeren virker teknisk: Thomas er logget ind, godkendt, LMU-mappen er fundet, og den har sidst talt med hjemmesiden 22/10 kl. 21:03.
- Den har læst alle 58 resultatfiler. Kun 2 af dem (Fuji 17/10, LMGT3) gav en tid – de er allerede gemt, derfor "2 dubletter".
- I de andre 56 filer blev Thomas ikke genkendt eller havde ingen gyldig bedste omgang. "1202 sprunget over" er de andre kørere i filerne og er normalt.

Hvilken af de to grunde det er, kan jeg ikke se uden en af hans filer. Mulige grunde:
1. Navnet i filen er ikke præcis "Thomas Gregersen" (fx Steam-navn, ekstra tegn eller forkortelse). Trackeren godtager små stavefejl, men hjemmesiden kræver i dag præcis samme navn, så tiden bliver afvist.
2. Filerne er sessioner uden en gyldig omgang (fx kun out-laps eller afbrudte sessioner).

## Plan
1. **Hjemmesiden godtager samme navne som trackeren:** små forskelle i navnet (store/små bogstaver, mellemrum, accenter, mindst 85 % ens) godtages, så tider ikke afvises lydløst. Tiden gemmes stadig kun på Thomas selv.
2. **Trackeren viser hvorfor:** efter en scanning står der fx "40 filer: du var ikke i filen · 16 filer: ingen gyldig omgang · 2 dubletter", og navnet fra filen vises, når det ikke matcher. Så kan kørerne selv se, om det er navnet, der er galt.
3. **Bekræft med Thomas' fil:** Bed Thomas sende én resultatfil fra en session, der manglede (fra mappen i billedet). Så tjekker jeg navnet og omgangene direkte.

Punkt 1 virker med det samme for alle. Punkt 2 kræver en ny version af trackeren, som kørerne skal hente.

## Tekniske detaljer
- `upload_leaderboard_time_with_device_token`: brug samme normalisering og lighedstjek som `nameSimilarity` (≥ 0,85) i stedet for eksakt `<>`.
- `companion/electron/lmu-watcher.cjs` / `uploader.cjs`: tæl skip-årsager pr. fil (not_in_file, no_best_lap, duplicate) og send dem videre til UI-statuslinjen sammen med det nærmeste navn i filen.
- Bump companion-versionen (1.0.37 → 1.0.38).
