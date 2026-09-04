# Automatisk DNF / RET / DNS ud fra resultatfilerne

Kort svar: ja, det kan systemet selv afgøre — resultatfilerne indeholder både antal omgange, sluttid og en status pr. kører. I dag udnyttes kun en del af det, og alt sættes til enten "DNF" eller ingenting, som du så retter i hånden.

## Sådan er det i dag (verificeret)

- Ved upload: hvis en kører har gennemført løbet, sættes tid + omgange. Hvis ikke, sættes DNF — uanset om vedkommende kørte 90% eller aldrig kom ud af pitten.
- DNS sættes aldrig automatisk ved upload; kun kørere der slet ikke findes i filen får en DNS-linje bagefter.
- 70%-reglen bruges allerede, men kun til at afgøre om en udgået kører får point — den vises ikke som en selvstændig status.
- I kvalifikationen sættes DNS, så snart der ikke findes en omgangstid. Der skelnes ikke mellem "kørte aldrig ud" og "kørte, men fik ingen godkendt tid".

## Hvad der ændres

Tre klare statusser i stedet for to, sat automatisk ved upload:

1. **DNS** — køreren står ikke i filen, eller står med 0 omgange. Ingen point.
2. **RET (udgået)** — køreren gennemførte ikke, men nåede mindst 70% af klassevinderens omgange. Klassificeres og får point som i dag.
3. **DNF** — køreren gennemførte ikke og nåede under 70%. Ingen point.

Detaljer:
- Statussen genberegnes automatisk, når man skifter afdelingens 70%-grænse eller retter omgangstal — så den altid passer til det felt der faktisk er uploadet.
- Alle tre kan stadig overstyres manuelt i stillingseditoren (samme afkrydsning som nu, blot med RET som ekstra), så du altid kan rette en fejl i en serverfil.
- Straffe, pointstraf og DSQ fungerer præcis som nu og røres ikke.

Kvalifikation:
- **DNS** — køreren står ikke i filen eller har 0 omgange (kom aldrig ud af pitten).
- **NT (ingen tid)** — køreren kørte omgange, men uden en godkendt tid. Vises som "Ingen tid" og placeres efter alle med tid, men før DNS.

Visning: RET, DNF, DNS og NT vises som mærkat i stillingerne på afdelingssiden og forsiden, med samme rækkefølge som i dag (klassificerede → ingen tid → ikke startet).

## Sikkerhed for eksisterende data

- Ingen ændring af allerede gemte resultater. Gamle rækker uden RET-mærkat vises som hidtil.
- Point beregnes efter nøjagtigt samme regler som nu (samme pointtabel, samme 70%-grænse, straffe trukket én gang) — den nye status ændrer kun *mærkatet*, ikke pointene.
- Efter ændringen laves en kontrolkørsel på den seneste ICE CUP-afdeling: point og placeringer skal være identiske med i dag, kun med korrekt DNF/RET/DNS.

## Teknisk

- `src/lib/lmu-parser.ts`: eksponér `FinishStatus` råt (finished / dnf / dq) og `laps`/`validLaps` per kører, så importen kan skelne "0 omgange" fra "udgået sent".
- `src/routes/_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx`: `DraftRow` får `ret: boolean` ved siden af `dnf`/`dns`; `importXml` sætter dns ved 0 omgange/manglende linje, ellers dnf/ret. Klassifikationen afgøres i preview-beregningen, hvor `minLaps` allerede findes, så mærkatet følger den aktuelle 70%-grænse. Kvalifikation: `q_dns` beholdes for 0 omgange, ny `q_nt` for omgange uden gyldig tid.
- `src/lib/league-results.functions.ts`: gem status som et felt i resultatrækken (`status`: `classified|ret|dnf|dns|dsq`) og spejl det i `divisions.settings.results`. Pointlogikken forbliver uændret og læser fortsat omgange + 70%-grænse.
- `src/routes/ligaer.$leagueId.afdeling.$divisionId.tsx` og `src/routes/index.tsx`: vis den nye status; nuværende sorteringsregel (klassificeret → ingen tid → DNS) bevares med RET placeret som klassificeret.
- Ingen databasemigrering nødvendig — status gemmes i den eksisterende resultat-JSON og som tekstfelt der defaulter til nuværende adfærd.
