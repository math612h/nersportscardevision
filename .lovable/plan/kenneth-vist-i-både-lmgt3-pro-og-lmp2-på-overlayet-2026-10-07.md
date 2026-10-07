# Kenneth vist i både LMGT3 Pro og LMP2 på overlayet

## Sandsynlig årsag (fundet i koden, ikke genskabt live)
Kenneth har to tilmeldinger i ICE Cup: en gammel, udmeldt LMGT3 Pro (#134) og den aktive LMP2 (#6).
Overlayets team-lineup-feed henter kørernes bilnummer og klasse fra tilmeldingerne, men tager også de udmeldte med. Når der er to, vælges en tilfældig af dem. Derfor kunne Kenneth få LMGT3 Pro / #134 påført, selvom han kørte LMP2 — og overlayet viste ham i begge klasser med samme placering.

At han havde samme point i begge tabeller passer med dette: overlayet regner point pr. kører, og fordi han dukkede op med to klasser, blev den samme sum vist i begge. Hjemmesidens stillinger og Discord-beskeden holder klasserne adskilt korrekt (LMGT3: 43 point fra Silverstone og Interlagos, LMP2: Imola plus tiltrædelsespoint) — fejlen ligger kun i det feed, overlayet henter.

Det samme kan ramme alle, der har skiftet klasse i løbet af sæsonen.

## Rettelse
- Feedet bruger kun aktive tilmeldinger (ikke udmeldte) til bilnummer, klasse og kategori.
- Hvis en kører alligevel har flere aktive tilmeldinger, vælges den, der matcher lineupets klasse.
- Gennemgå de øvrige overlay-feeds for samme fejl (entryliste og streamprofiler filtrerer allerede korrekt).
- Ingen ændringer i resultater, point eller data.

## Verifikation
Hent feedet for ICE Cup og bekræft, at Kenneth kun står som LMP2 #6.

## Teknisk
`src/routes/api/public/broadcast/team-lineups.ts` (~L107-115): tilføj `.is("withdrawn_at", null)` på entries-forespørgslen og nøgl opslaget på `league_id:user_id:car_class` med fallback til `league_id:user_id`.
