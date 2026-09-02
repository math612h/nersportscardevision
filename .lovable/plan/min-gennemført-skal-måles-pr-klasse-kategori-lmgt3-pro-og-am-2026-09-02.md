# Min.-gennemført-% skal måles pr. klasse+kategori (LMGT3 Pro og Am hver for sig)

## Mål
Tærsklen for at undgå DNF (fx "mindst 75% af vinderens omgange") skal altid beregnes ud fra vinderen i kørerens **egen klasse inkl. kategori** — dvs. LMGT3 Pro, LMGT3 Am og LMP2 hver for sig. En LMGT3 Am-kører må aldrig måles mod LMGT3 Pro- eller LMP2-omgange.

## Nuværende tilstand (verificeret)
- **Kontrolpanel → Stillinger** (den levende import-/redigeringsvej): både preview og gem grupperer allerede på `car_class + driver_category`, så Pro og Am måles hver for sig. Korrekt.
- **`uploadLeagueRaceResult` i `src/lib/league-results.functions.ts`** (ældre server-upload, pt. ikke kaldt fra UI): grupperer KUN på `car_class` (linje 281-294). Her ville en LMGT3 Am-kører blive målt mod hele LMGT3-feltets fleste omgange (typisk Pro-vinderen). Forkert.
- Hjælpeteksten i pointsystem-editoren siger allerede "af vinderens omgange **i sin klasse**", så den stemmer overens med den ønskede opførsel.

## Ændringer
1. **`src/lib/league-results.functions.ts`** — i `uploadLeagueRaceResult`:
   - Gruppér DNF-tærsklen på `car_class + driver_category` i stedet for kun `car_class`, så max-omgange og tærskel beregnes pr. klasse+kategori (matcher stillings-editorens logik).
   - Position- og pointtildelingen pr. gruppe følger samme gruppering, så Pro og Am fortsat rangeres hver for sig.
2. **Verificér** at stillings-editorens to steder (preview-beregning og save-ranking i `stillinger.tsx`) allerede bruger `car_class|driver_category` — ingen ændring forventet, kun gennemgang.

## Tekniske detaljer
- Grupperingsnøgle: `` `${car_class}|${driver_category ?? ""}` `` — samme mønster som `groupKeys` i `src/routes/_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx`.
- `driver_category` kommer fra kørerens tilmelding (`entries.driver_category`) via `matchDriversFromXml`.
- Ingen database-ændringer. Ingen ændring i pointsystem-indstillingen (`min_finish_percent`).
- Qualifying påvirkes ikke (tærsklen gælder kun race).
