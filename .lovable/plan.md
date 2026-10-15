# To rettelser: livestream på forsiden + placering på ligasiden

## 1. Livestream vises ikke på forsiden

**Årsag (bekræftet):** Tabellen `broadcast_live_state` har en åben læseregel (RLS), men tabellen mangler læserettigheder (GRANT SELECT) for ikke-loggede besøgende. Databasen svarer "permission denied", forsiden får et tomt svar og viser ingenting. Det forklarer også, hvorfor den automatiske "Seneste livestream" aldrig virkede efter hensigten.

**Ændring:** Én lille database-migration:

```sql
GRANT SELECT ON public.broadcast_live_state TO anon, authenticated;
```

Ingen kodeændringer — det gemte Fuji-link er korrekt gemt og slået til, så det dukker automatisk op på forsiden, så snart rettigheden er på plads.

**Verificering:** Gentage databasetesten (skal returnere rækken i stedet for "permission denied") og bekræfte i previewet, at livestream-boksen vises med den indlejrede afspiller.

## 2. "Din mesterskabsplacering" på ligasiden stemmer ikke med Stillinger

**Årsag (bekræftet):** Boksen "Din mesterskabsplacering" på ligaens oversigt (`MyChampionshipPosition` i `src/routes/ligaer.$leagueId.index.tsx`) beregner selv sine egne point direkte fra de rå resultatfiler. Den kender hverken til drop-runden, tiltrædelsespoint eller ligaens pointregler — Stillinger-siden bruger den fulde beregning. Derfor kan placering og point afvige.

**Ændring:** Omskriv `MyChampionshipPosition`, så den bruger samme datakilde og beregningsregler som Stillinger (`league_results`, ligaens pointsystem inkl. drop-runder og strafpoint), og find placeringen ved at rangere inden for kørerens klasse/kategori præcis som stillingstabellen. Viste point og placering bliver dermed altid identiske med Stillinger.

**Verificering:** Åbne ligaens oversigt i previewet med en testbruger og sammenligne "#X · Y point" med kørerens række i Stillinger — de skal matche, også med drop-runden aktiv.
