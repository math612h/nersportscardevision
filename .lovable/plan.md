# Gem umatchede kørere ved resultat-upload

## Baggrund

Navne fra en resultatfil, der ikke kunne matches til en profil, gemmes ingen steder i dag — de findes kun i den uploadede fil mens siden er åben. Derfor skal filen uploades igen for at se dem.

**Svar på spørgsmålet:** For Interlagos-filerne skal de uploades én gang til — navnene fra sidst er væk. Det er sikkert at uploade igen: editoren udfylder bare kladde-rækkerne på ny, og gemning overskriver de gamle resultatrækker i stedet for at lave dubletter.

## Ændringen

Fremadrettet gemmes det hele ved upload, så gen-upload aldrig er nødvendig:

1. **Ved import gemmes filens data på afdelingen** (`divisions.settings.imports`):
   - Filnavn, session (race/quali), server, tidspunkt
   - Parsede kørere (navn, position, omgange, tider) — nok data til at genåbne matchningen fuldt ud
   - Listen over umatchede navne

2. **Stillingssiden viser "Ikke matchet"-panelet fra gemte data:**
   - Når en afdeling åbnes, vises panelet automatisk, hvis der er gemte umatchede navne
   - "Match kørere"-knappen genåbner match-dialogen med de gemte kørere — manuel matchning kan laves uden filen
   - Når et navn matches, fjernes det fra den gemte liste

3. **For Interlagos nu:** upload filerne én gang til — herefter husker systemet dem.

## Tekniske detaljer

- `src/routes/_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx`:
  - `applyParsed`/`importXml` gemmer `{ fileName, kind, server, uploadedAt, drivers, unmatched }` i `divisions.settings.imports` (overskriver pr. server+kind)
  - Ved load af afdeling: læs `settings.imports`, vis panel for umatchede navne, genåbn match-dialog fra gemte parsede kørere
  - Efter succesfuld match opdateres den gemte import (fjern matchede navne)
- Ingen database-migration nødvendig — alt gemmes i eksisterende `settings`-felt
- Leaderboard-indsættelser er beskyttet mod dubletter af eksisterende unique-indeks
