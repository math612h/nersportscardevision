# Discord-stillinger skal matche hjemmesiden

## Hvorfor de ikke passer
Discord og hjemmesiden regner stillingerne ud hver for sig:
- **Hjemmesiden** fratrækker den dårligste afdeling (drop-runde, ICE Cup har 1) og bruger ligaens fælles regler for lige point (DNF før DNS osv.).
- **Discord** lægger blot alle afdelingers point sammen minus strafpoint — uden drop-runde. Da drop-runden blev indført, blev Discord bevidst holdt på fuld total. Derfor står kørere med en dårlig/DNS-afdeling højere på Discord end på hjemmesiden, og rækkefølgen kan afvige.

## Hvad der ændres
1. Flyt hjemmesidens stillingsberegning (drop-runde, strafpoint, rækkefølge ved lige point, udmeldte) ud i én fælles beregning, som både hjemmesiden og Discord bruger.
2. Discord-beskeden viser samme total som hjemmesiden (efter drop). Valgfrit: lille note i bunden "Dårligste afdeling fratrukket".
3. Teamstillingen på Discord gennemgås, så den bruger samme regler som teamstillingen på hjemmesiden.
4. Tjek: sammenlign ICE Cup Pro og Am mellem hjemmeside og den genererede Discord-besked, kører for kører, før udgivelse.

## Tekniske detaljer
- `src/lib/discord-standings.server.ts` summerer `settings.results[].points - penalty_points` direkte; ingen `drop_rounds`.
- Drop-logik ligger i dag kun i `src/routes/ligaer.$leagueId.index.tsx`; den flyttes til et delt modul i `src/lib/` (browser- og server-sikkert) og importeres begge steder.
- Lille test for drop-runde: kører med 30/0(DNS)/25 og `drop_rounds: 1` → 55.
