# Retvisende og redigerbar Pro/Am-opdeling

## Mål
Gøre previewet af en Pro/Am-opdeling retvisende i forhold til kørernes leaderboard-tier og give admin fuld kontrol over fordelingen før publicering.

## Ændringer
- Erstat den nuværende preview-score, som bruger samlet ELO og én hurtigste omgang på tværs af forskellige baner, med den eksisterende klassespecifikke leaderboard-rating fra `user_class_ratings` for den valgte bilklasse.
- Brug klassens præcise score og percentil til sortering, så kørere med forskellige leaderboard-tiers ikke ender med samme kunstige standardscore. Vis rating, percentil/tier og datastatus i previewet i stedet for den nuværende uklare 0–100-score.
- Håndter manglende klassedata deterministisk: kørere med rating sorteres efter klassescore, mens kørere uden rating placeres nederst og markeres tydeligt som “Ingen rating”. Navn bruges som stabil tie-breaker.
- Bevar en balanceret automatisk startfordeling, men basér splitpunktet på den korrigerede klassescore og ratingforskelle.
- Gør begge preview-lister redigerbare:
  - Flyt en enkelt kører mellem Pro og Am via en tydelig flytteknap.
  - Angiv et antal og flyt automatisk de bedste fra Am til Pro eller de lavest placerede fra Pro til Am.
  - Opdatér antal og rækkefølge med det samme uden at gemme noget endnu.
- Send den redigerede, eksplicitte liste af entry-id’er ved “Publicér opdeling”, så backend gemmer præcis den fordeling admin har godkendt og ikke genberegner den.
- Validér på serveren, at alle valgte entries tilhører den pågældende liga og bilklasse, at ingen entry mangler eller forekommer i begge grupper, og at begge grupper indeholder mindst én kører.
- Genbrug samme klassespecifikke ratinggrundlag i den automatiske kategori-anbefaling ved senere tilmeldinger, så nye kørere vurderes efter samme målestok som den oprindelige opdeling.

## Teknisk
- Flyt beregnings- og valideringshjælpere ud af server-function-modulet, så serverfunktionen forbliver en tynd RPC-wrapper.
- Udvid split-resultatet med entry-id, klassescore, percentil og datastatus.
- Udvid inputtet til publicering med de manuelt godkendte Pro/Am-entry-id’er.
- Tilføj fokuserede tests for forskellige tiers, standard/manglende ratings, stabil sortering, enkeltflytning, masseflytning og validering af publicerede grupper.

## Verifikation
- Kontrollér med eksisterende liga-data, at previewets rækkefølge følger de klassespecifikke leaderboard-tiers og ikke samler mange kørere på samme score.
- Test manuelt flyt af én kører og antalbaseret flyt i begge retninger.
- Publicér en testfordeling og kontrollér, at den gemte Pro/Am-fordeling svarer nøjagtigt til previewet.
