# Rul tilbage efter fejlagtig Fuji-upload på Afdeling 1

## Hvad der skete i aften (bekræftet i databasen)

- Kl. 20:19 uploadede en admin Fuji-resultatfilen til **Afdeling 1 – Silverstone** i stedet for Afdeling 4.
- Det **slettede alle de oprindelige Silverstone-resultater** (103 rækker) og erstattede dem med Fuji-løbets resultater, nu vist som "runde 1".
- Kl. 20:25 blev den samme Fuji-fil uploadet til den rigtige **Afdeling 4 – Fuji**, men rækkerne står med **0 point**.
- Den fejlagtige upload udløste desuden **automatiske udmeldelser** (3 DNS-reglen) kl. 20:25 og 20:35 — kørere kan være meldt ud på forkert grundlag.

## Den gode nyhed

Systemets ændringslog (audit log) gemte et komplet øjebliksbillede af Afdeling 1, som den så ud **før** uploaden — inklusive alle oprindelige resultater, point og straffe. Vi kan derfor genskabe afdelingen præcist, som den var.

## Plan

1. **Genskab Afdeling 1 – Silverstone**
   - Hent det gemte øjebliksbillede fra ændringsloggen (posteringen kl. 20:19:57).
   - Slet de 103 forkerte rækker, der blev oprettet i aften på afdeling 1.
   - Gendan afdelingens gemte resultatdata fra loggen og kør **"Genberegn point"** på runde 1, så resultatrækkerne genopbygges korrekt — inklusive tiltrædelsespoint (Kenneth Dahl Nielsens 2×8 point m.fl.), strafpoint og DNS/DNF-statusser.

2. **Ret Afdeling 4 – Fuji**
   - Kør **"Genberegn point"** på runde 4, så de 79 korrekte Fuji-resultater får tildelt de rigtige point i stedet for 0.

3. **Fortryd aftenens automatiske udmeldelser**
   - Find de kørere, der blev automatisk udmeldt af 3 DNS-reglen kl. 20:25 og 20:35, og vurder pr. kører om udmeldelsen skyldtes de forkerte data.
   - Genindmeld dem, der blev ramt uberettiget, og genberegn deres DNS-tæller.

4. **Kontrol**
   - Gennemgå stillingerne for begge klasser bagefter og verificér, at de matcher det forventede (fx Frontline 60 point i LMGT3 som tidligere verificeret).

## Tekniske detaljer

- Kilden til gendannelsen er `audit_log.old_data` for `divisions`-opdateringen kl. 20:19:57 (indeholder `settings.results` med samtlige originale resultatrækker inkl. user_id, point, status og straffe).
- Sletning af de forkerte `league_results`-rækker sker kun for `division_id = 2c6b3557…` (Afdeling 1) og kun rækker oprettet i aften — intet andet røres.
- Point-genberegningen bruger den eksisterende "Genberegn point"-funktion i kontrolpanelet, som allerede er brugt med succes tidligere.
- Ingen kodeændringer — kun dataoprydning. Ændringsloggen røres ikke, så sporet fra aftenen bevares.
- Bemærk: Hvis de automatiske udmeldelser nåede at sende Discord-beskeder til kørerne, kan beskederne ikke trækkes tilbage — men vi kan genindmelde kørerne, så de kan deltage igen.
