# Jens bliver ved med at blive meldt ud — årsag og rettelse

## Hvad der skete (bekræftet i databasen)

- 19/10 kl. 20:47 (dansk tid) blev Fuji bekræftet og gemt i stillingseditoren. To sekunder efter gemningen blev Jens' rigtige Fuji-resultat (**P11, 18 point**) erstattet med en **DNS**. DNS-kontrollen kørte så på de bekræftede data og talte 3 udeblivelser (Interlagos, Imola, "Fuji"), og Jens blev meldt ud kl. 20:47:31.
- Årsagen er en fejl i stillingseditoren: Jens har **fire gamle, udmeldte tilmeldinger** i ICE Cup fra rodet 14/10 og én aktiv. Når editoren kobler gemte resultater til tilmeldinger, går den ældste tilmelding først — så en gammel udmeldt tilmelding "tager" hans P11-resultat. De gamle tilmeldinger skjules i editoren, fordi han har en aktiv, så hans aktive tilmelding står tom og gemmes som DNS. Resultatet forsvinder hver gang nogen trykker gem.
- Det rammer kun kørere, der har en udmeldt og en aktiv tilmelding i samme klasse. Jens er den eneste lige nu, men det kan ske igen for alle der melder sig ud og ind.

## Plan

1. **Ret koblingen i editoren**: aktive tilmeldinger får altid først fat i en kørers resultat; udmeldte tilmeldinger får kun et resultat, hvis der er et tilovers. Så kan en gemning aldrig lave et rigtigt resultat om til DNS.
2. **Sikkerhedsnet ved gem**: hvis en kører gemmes som DNS, men det oprindelige uploadede resultat for samme kører og klasse viser, at han kørte, beholdes det rigtige resultat.
3. **Gendan Jens' data**: sæt Fuji-resultatet tilbage til P11, 18 point (både i afdelingens resultater og i pointtabellen), og ryd hans forældede dobbeltrække på Silverstone (der ligger både en gammel P10/0 point og den rigtige P8/21 point).
4. **Genindmeld Jens** (genåbn hans tilmelding fra 19/10) og send ham en kort besked på siden og Discord: fejlen lå hos os, han har kun 2 udeblivelser og er med resten af sæsonen.
5. **Tjek alle ligaer** for andre kørere, hvor en bekræftet afdeling viser DNS, men den uploadede fil viser, at de kørte — og rapportér evt. fund.
6. **Kontrol**: åbn Fuji i editoren, tryk gem, og bekræft at Jens stadig står P11 og ikke bliver meldt ud.

## Teknisk

- `src/routes/_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx` `buildLookup` (~L255-272): kør claim-passene først for aktive (`!withdrawn_at`), derefter for udmeldte entries.
- I `save()`: før `dedupeByUserClass`, hvis en DNS-række har en klassificeret modpart i `existingRace` for samme `user_id+car_class` som ikke er blevet brugt, behold modparten.
- Datafix: `divisions.settings.results` for Fuji (`1389adee-…`) — erstat Jens' DNS-række med P11-rækken fra audit_log id 5012; opdatér `league_results` for Fuji (P11, 18 pt); slet den forældede Silverstone-række (P10, 0 pt, opdateret 2026-09-02). Entry `33767d35-…` er i forvejen aktiv — tjek om det er en genindmeldelse han selv har lavet; ellers sæt `withdrawn_at=null` på `c219a140-…`. Lineup genåbnes hvis lukket af DNS-udmeldelsen.
- Besked via eksisterende `sendAdminDirectMessage`. Ingen migration.
