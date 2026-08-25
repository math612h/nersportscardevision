# Batch-sikker leaderboard-rating til Pro/Am

## Mål
Gøre Pro/Am-opdelingen retvisende ved at bruge historiske leaderboard-data fra de seneste fire spilversioner uden nogensinde at sammenligne rå omgangstider på tværs af versioner, baner eller layouts.

## Bekræftet nuværende adfærd
- De historiske leaderboard-rækker bevares og indgår allerede i klasse-ratingen.
- Den nuværende databaseberegning vælger dog én absolut hurtigste omgang pr. kører og sammenligner den med en median for hele bilklassen på tværs af baner og sessions.
- Den viste leaderboard-side filtrerer kun visningen til den aktuelle patch; dette filter styrer ikke den eksisterende klasse-rating.
- `game_version` fra resultatfilerne er tilgængelig på leaderboard-rækkerne og kan bruges som batch-id.

## Ændringer
1. Erstat leaderboard-delen af klasse-ratingen med en batch-sikker beregning:
   - Find de seneste fire forskellige spilversioner med leaderboard-data for den valgte bilklasse.
   - Bevar den fulde spilversion som batch, så forskellige versioner aldrig blandes.
   - Inden for hver version grupperes tider yderligere efter bilklasse, bane og layout.
   - Brug kun kørerens bedste tid i den konkrete sammenligningsgruppe.
   - Beregn en relativ placering mod de øvrige kørere i præcis samme gruppe; grupper med færre end to kørere giver ingen sammenligningsscore.
2. Saml en kørers grupper uden at blande omgangstider:
   - Gennemsnit kørerens relative gruppescores inden for hver spilversion.
   - Lad hver af de op til fire spilversioner vægte lige meget i den endelige leaderboard-score, så mange uploads i én version ikke giver ekstra vægt.
   - Beregn confidence ud fra antallet af brugbare versioner og sammenligningsgrupper, og markér kørere uden sammenlignelige data som uden rating.
3. Brug den nye score konsekvent i `user_class_ratings`, Pro/Am-previewet og den automatiske kategori-anbefaling ved senere tilmeldinger.
4. Genberegn eksisterende klasse-ratings efter den nye model og sørg for, at nye, ændrede eller slettede leaderboard-rækker opdaterer de berørte ratings og percentiler korrekt.
5. Bevar den allerede implementerede manuelle flytning og publicering af den eksplicit godkendte Pro/Am-fordeling uændret.

## Datakvalitet
- Rækker uden `game_version` kan ikke placeres sikkert i en versionsbatch og udelades fra denne leaderboard-beregning.
- Versionsrækkefølgen afgøres numerisk, ikke alfabetisk.
- Rå millisekunder forlader aldrig deres egen kombination af spilversion, bilklasse, bane og layout.

## Verifikation
- Tilføj tests med markant forskellige omgangslængder og versioner, som beviser, at tider ikke krydssammenlignes.
- Test at kun de seneste fire versioner tæller, og at hver version vægter lige meget.
- Test dubletter, manglende version, kun én kører i en gruppe samt slettede tider.
- Kontrollér en konkret Pro/Am-preview mod de underliggende grupper og bekræft, at rating, percentil/tier og rækkefølge følger den nye model.
