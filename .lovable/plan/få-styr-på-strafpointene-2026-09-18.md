# Få styr på strafpointene

## Hvad der er galt

Straffene lægges oveni hinanden, hver gang en afgørelse bliver forsøgt gemt. Jeg har tjekket hver enkelt afgørelse mod det, der faktisk står i stillingerne:

| Kører | Afdeling | Stewards' afgørelse | Står i dag |
|---|---|---|---|
| Kristoffer Falkenberg | Silverstone | 2 | 2 (korrekt) |
| Dennis Meisner | Silverstone | 4 | 4 (korrekt) |
| Thomas B. Andersen | Interlagos | 3 | 3 (korrekt) |
| Lauge Stello | Interlagos | 4 | 8 (dobbelt) |
| Jan Stig Larsen | Interlagos | 4 | 24 (seks gange) |

Årsagen: når en afgørelse gemmes, skrives straffen først ind i resultaterne og først derefter gemmes selve afgørelsen. De sidste dage fejlede det sidste trin (fejlen om manglende banenavn, som nu er rettet). Hver gang stewarden prøvede igen, blev straffen lagt oveni endnu en gang, fordi systemet ikke kunne se, at den allerede var trukket.

Der ligger også en gammel testprotest med 5000 strafpoint på din egen konto. Den har aldrig ramt nogen resultater, men den bør ryddes op, så den ikke pludselig bliver aktiv.

## Det jeg laver

1. **Retter tallene nu:** Lauge Stello sættes til 4 strafpoint, Jan Stig Larsen til 4. De tre øvrige rører jeg ikke. Interlagos-stillingen retter sig derefter selv.
2. **Fjerner testprotesten** med 5000 point, så den ikke kan give udslag senere.
3. **Sikrer mod gentagelse:** Straffene bliver fremover regnet ud fra selve afgørelserne i stedet for at blive lagt til og trukket fra løbende. Gemmer man samme afgørelse to gange, eller fejler noget undervejs, ender resultatet det samme — aldrig dobbelt.

Alt andet — point, placeringer, tiltrædelsespoint og holdpoint — er urørt.

## Teknisk

- Datafix: `points_penalty` = 4 for Lauge (9e1bcf2a…) og Jan (65dfdc37…) i Interlagos (daf198b0…), både i `divisions.settings.results` (`penalty_points`) og i `league_results`. Protest 319ebce0 (5000 point) sættes til `no_penalty`/ryddes.
- `applyProtestRuling` i `src/lib/league-results.functions.ts` omskrives fra delta-baseret (`row.penalty_points - old + new`) til deterministisk genopbygning: hent alle `ruled` protester for afdelingen, byg ét samlet straf-map pr. `user_id` (point, sekunder, dsq) inkl. den afgørelse der gemmes nu, og sæt `penalty_points`/`penalty_seconds`/`dsq` absolut på rækkerne før `recalculateStoredRaceRows`.
- Rækkefølgen vendes: protest-rækken (`status`, `verdict_*`, `applied_penalties`) opdateres først, derefter skrives `divisions.settings` og `syncStoredRaceRowsToLeagueResults`. Så efterlader en fejl midtvejs ikke en straf uden registrering.
- Verifikation: typecheck, tjek Interlagos-stillingen i preview, og gem samme afgørelse to gange i træk for at bekræfte at tallet står stille.
