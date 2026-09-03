# Fejlagtige placeringer og points i de viste stillinger

## Hvad der faktisk er galt (verificeret i databasen)

Resultaterne gemmes **to steder** for hver afdeling:

1. `league_results` — den "rigtige" resultattabel (bruges bl.a. på afdelingssiden).
2. En kopi inde i afdelingens indstillinger (`divisions.settings.results`) — den bruges af **forsiden og ligasidens samlede stilling**.

Da points blev rettet efter den korrigerede pointtabel, blev **kun** `league_results` opdateret. Kopien blev ikke rørt. Derfor:

- `league_results` for Afdeling 1 – Silverstone: Daniel Kokborg P8 = **21 point** (korrekt).
- Kopien i afdelingens indstillinger: Daniel Kokborg P8 = **11 point** (gammel tabel). Samme for Johnny Bertelsen (12 i stedet for 22), Kenneth Dahl Pedersen (12 i stedet for 22), Jens Rasmussen (11 i stedet for 21), Thomas Colditz (16 i stedet for 15) m.fl.

Fordi ligasidens samlede stilling sorterer efter point fra kopien, ender Daniel Kokborg (og de andre ramte) på en helt forkert plads — selvom placeringen i uploadet er rigtig.

Derudover står DNS/DNF-kørere i kopien med `class_position: 0`, hvilket giver rodet rækkefølge i de visninger, der sorterer på placering.

## Løsning

1. **Datafix nu:** genberegn point i kopien (`divisions.settings.results`) for alle afdelinger ud fra ligaens aktuelle pointtabel og den gemte placering, så kopien matcher `league_results` præcis. DNF/DNS beholder 0 point.
2. **Fjern årsagen — én kilde til sandhed:** ligasidens samlede stilling og forsidens resultatvisning skal læse point/placering fra `league_results` (via samme fælles hjælpefunktion), og kun bruge kopien til det, den ikke har: kørernavn, bilnummer, DNS/DNF-markering. Så kan de to aldrig komme ud af sync på point igen.
3. **Ensartet sortering:** i alle visninger sorteres klassificerede kørere efter placering, derefter "No Time", og DNS/DNF nederst — også når kopien har `class_position: 0`.
4. **Admin-knap "Genberegn point":** på ligaens stillinger-side, som kører pointtabellen igennem alle gemte afdelinger (begge lagringssteder) — så en fremtidig rettelse i pointsystemet kan slås igennem uden manuelle databaseindgreb.

## Tekniske detaljer

- Fælles hjælper (fx `src/lib/league-points.ts`): `pointsForPosition(pointsPerPosition, position, { dnf, dns })` og en `mergeResultRows()` der kobler `league_results` (autoritativ på position/points/straf) sammen med kopiens navn/nummer/DNS-flag på nøglen `user_id` med fallback `car_class|driver_category|car_number`.
- Berørte filer: `src/routes/ligaer.$leagueId.index.tsx` (samlet stilling + team-point), `src/routes/index.tsx` (forsidens resultater), `src/routes/ligaer.$leagueId.afdeling.$divisionId.tsx` (sortering), `src/routes/_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx` (genberegn-knap), `src/lib/league-results.functions.ts` (publish skriver point ét sted fra).
- Datafixet køres som en dataopdatering (ingen skemaændring), der for hver afdeling mapper hver række i kopien til den tilsvarende `league_results`-række og overskriver `points`.
- Ingen ændring af selve pointtabellen i ligaopsætningen — den bruges som den står nu.
