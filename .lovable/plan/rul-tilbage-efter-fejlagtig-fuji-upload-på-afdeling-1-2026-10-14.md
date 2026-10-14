# Rul tilbage efter fejlagtig Fuji-upload på Afdeling 1

## Hvad der skete i aften (bekræftet i databasen)

- Kl. 20:19 uploadede en admin Fuji-resultatfilen til **Afdeling 1 – Silverstone** i stedet for Afdeling 4.
- Det **slettede alle de oprindelige Silverstone-resultater** (103 rækker) og erstattede dem med Fuji-løbets resultater, nu vist som "runde 1".
- Kl. 20:25 blev den samme Fuji-fil uploadet til den rigtige **Afdeling 4 – Fuji**, men rækkerne står med **0 point**.
- Den fejlagtige upload udløste **automatiske udmeldelser** (3 DNS-reglen) kl. 20:25: **Ronni Simonsen, Lukas Weiss, Martin Sørensen, Nicolai Larsen og Jens Rasmussen** — plus en reserveoprykning (Malthe Hansen).
- **Jens Rasmussen meldte sig selv til igen** kl. 20:31, blev automatisk udmeldt igen kl. 20:35, og meldte sig til igen kl. 20:36. Han har nu flere tilmeldinger i systemet.

## Den gode nyhed

Systemets ændringslog gemte et komplet øjebliksbillede af Afdeling 1, som den så ud **før** uploaden — inklusive alle oprindelige resultater, point og straffe. Vi kan derfor genskabe afdelingen præcist, som den var.

## Plan

1. **Genskab Afdeling 1 – Silverstone**
   - Hent det gemte øjebliksbillede fra ændringsloggen (posteringen kl. 20:19:57).
   - Slet de 103 forkerte rækker, der blev oprettet i aften på afdeling 1.
   - Gendan afdelingens gemte resultatdata fra loggen og kør **"Genberegn point"** på runde 1, så resultatrækkerne genopbygges korrekt — inklusive tiltrædelsespoint (Kenneth Dahl Nielsens 2×8 point m.fl.), strafpoint og DNS/DNF-statusser.

2. **Ret Afdeling 4 – Fuji**
   - Kør **"Genberegn point"** på runde 4, så de 79 korrekte Fuji-resultater får tildelt de rigtige point i stedet for 0.

3. **Fortryd aftenens automatiske udmeldelser + Discord-DM**
   - Genindmeld de fem kørere, der blev udmeldt kl. 20:25/20:35, og genberegn deres DNS-tæller på de rigtige data.
   - Send en **personlig besked på Discord** til hver af dem: kort forklaring om at udmeldelsen skyldtes en teknisk fejl, at de er genindmeldt, og at deres point er intakte.
   - Gennemgå reserveoprykningen (Malthe Hansen) og justér, hvis den kun skete på grund af fejlen.

4. **Jens Rasmussens genindmelding**
   - Hans historiske resultater og point er knyttet til ham som bruger — ikke til tilmeldingen — så **hans gamle point følger med**, når afdeling 1 er genskabt.
   - Ryd op i hans tre tilmeldinger (én aktiv, resten markeret som udmeldte), og verificér at han **ikke** får tiltrædelsespoint oveni, som om han var ny i ligaen.

5. **Kontrol**
   - Gennemgå stillingerne for begge klasser bagefter og verificér, at de matcher det forventede (fx Frontline 60 point i LMGT3 som tidligere verificeret, og Jens Rasmussens total).

## Tekniske detaljer

- Kilden til gendannelsen er `audit_log.old_data` for `divisions`-opdateringen kl. 20:19:57 (indeholder `settings.results` med samtlige originale resultatrækker inkl. user_id, point, status og straffe).
- Sletning af de forkerte `league_results`-rækker sker kun for `division_id = 2c6b3557…` (Afdeling 1) og kun rækker oprettet i aften — intet andet røres.
- Point-genberegningen bruger den eksisterende "Genberegn point"-funktion, som allerede er brugt med succes tidligere.
- Discord-DM'ene sendes via den eksisterende Discord-beskedfunktion (samme der bruges ved automatisk udmeldelse).
- Ingen kodeændringer — kun dataoprydning. Ændringsloggen røres ikke, så sporet fra aftenen bevares.
- Bemærk: De automatiske udmeldelses-beskeder, der allerede er sendt på Discord, kan ikke trækkes tilbage — derfor erstatter vi dem med en forklarende opfølgning.
