# Fix: Livestream vises ikke på forsiden

## Årsag (bekræftet)

Tabellen `broadcast_live_state` har en åben læseregel (RLS), men selve tabellen mangler læserettigheder (GRANT SELECT) for ikke-loggede besøgende. Databasen svarer derfor "permission denied", og forsiden får et tomt svar — hverken det nye manuelle stream-link eller den gamle "Seneste livestream" kan vises. Bekræftet med et direkte databasekald, der returnerer netop denne fejl.

## Ændring

Én lille database-migration:

```sql
GRANT SELECT ON public.broadcast_live_state TO anon, authenticated;
```

Ingen kodeændringer — det gemte link (Fuji-streamen) er allerede korrekt gemt og slået til, så det dukker automatisk op på forsiden, så snart rettigheden er på plads.

## Verificering

- Gentage databasetesten: kaldet skal nu returnere rækken med `manual_video_id` i stedet for "permission denied".
- Åbne forsiden i previewet og bekræfte, at livestream-boksen vises med den indlejrede Fuji-afspiller.
