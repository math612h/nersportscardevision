# Tiltrædelsespoint — 8 point pr. ikke-deltaget afdeling

## Baggrund

En kører der tilmelder sig efter sæsonstart — eller skifter klasse midt i sæsonen — starter i dag på 0 point. Reglen skal være: 8 point pr. afdeling i klassen, som køreren ikke har deltaget i, fordi tilmeldingen (i den klasse) endnu ikke fandtes. Pointene vises som resultatrækker pr. afdeling i stillingerne.

## Regel

- Ved tilmelding til en liga (eller ny klasse i ligaen) får køreren 8 point for hver allerede afholdte afdeling, hvor køreren ikke har et resultat i den pågældende klasse.
- Gælder både helt nye tilmeldinger og klasseskift (fx Kenneth: LMGT3 Pro → LMP2 giver 8 point for hver af afdeling 1 og 2 i LMP2).
- En afdeling tæller som "afholdt", når der er uploadet resultater til den.
- Udmeldte kørere og ventelistetilmeldinger får ikke tiltrædelsespoint.

## Løsning

### 1. Tiltrædelsesrækker i resultatdata

Tiltrædelsespoint gemmes som markerede rækker (`joiner: true`, ingen placering, 8 point) i afdelingens gemte resultater — samme sted som de almindelige løbsresultater — så de automatisk fremgår af stillinger, forside og "min placering".

- Pointgenberegning (admin-knappen "Genberegn point") og nye resultat-uploads rører aldrig tiltrædelsesrækkerne — de bevares uændret.
- Hvis køreren senere får et rigtigt resultat i samme klasse og afdeling, erstatter det rigtige resultat altid tiltrædelsesrækken.

### 2. Automatisk oprettelse

En fælles backend-funktion sørger for, at tiltrædelsesrækkerne findes. Den kaldes automatisk:

- Når en bruger tilmelder sig en liga (eller tilføjer en ny klasse)
- Når en administrator tilføjer/godkender en tilmelding
- Ved hvert resultat-upload og ved "Genberegn point" (så alt også rettes op, hvis noget er glemt)

Funktionen er idempotent: den opretter kun rækker, der mangler, og ændrer aldrig eksisterende.

### 3. Visning

- I stillingernes rundeceller vises tiltrædelsesrækker som "–" (ingen placering) med 8 point, og en lille markering så man kan se at det er tiltrædelsespoint.
- På afdelingssiden vises de nederst i klassen med teksten "Tiltrædelsespoint" i stedet for placering.
- De tæller med i den samlede mesterskabsstilling på lige fod med øvrige point.

### 4. Tilbagevirkende kraft

Efter implementering køres funktionen én gang for igangværende ligaer (bl.a. ICE Cup), så eksisterende sene tilmeldinger og klasseskift — herunder Kenneths skift til LMP2 — får deres tiltrædelsespoint for allerede kørte afdelinger.

## Tekniske detaljer

- Ny delt helper `ensureJoinerPoints(supabaseAdmin, leagueId)` i `src/lib/league-results.functions.ts` (eller nyt modul): henter godkendte, ikke-udmeldte entries (med `created_at`) og afdelinger med resultater; indsætter manglende joiner-rækker i `divisions.settings.results` pr. (bruger, klasse) hvor `entry.created_at` er efter afdelingens løbsdato, og synkroniserer dem til `league_results` (status `"joiner"`, position NULL, points 8).
- `recalculateStoredRaceRows` ændres til at bevare rækker med `joiner: true` uændret (ikke klassificere, ikke genberegne point).
- `syncStoredRaceRowsToLeagueResults` udvides til også at indsætte/opdatere joiner-rækker i `league_results` (i dag kun UPDATE på rækker med placering — joiner-rækker kræver upsert).
- Kaldsites: tilmeldingsflowet på ligasiden (efter succesfuld tilmelding, fire-and-forget), `adminAddEntryToLeague`, `uploadLeagueRaceResult`/`publishLeagueRaceResult`, `recalcLeaguePoints`.
- `league_results.status`-check-constraint udvides med værdien `"joiner"` (migration, hvis nødvendigt).
- Visning: `ligaer.$leagueId.index.tsx` (stillingsceller) og `ligaer.$leagueId.afdeling.$divisionId.tsx` (afdelingens resultatliste) håndterer joiner-rækker; admin-uploadsiden (`admin.ligaer.$leagueId.stillinger.tsx`) bevarer dem ved import/gem.
- Antal point (8) læses fra ligaens pointsystem (`points_system.joiner_points`) med 8 som standard — så tallet kan justeres pr. liga senere uden kodeændring.

## Verifikation

- Typecheck grøn.
- Kenneth Dahl Pedersen har herefter 16 tiltrædelsespoint i LMP2 (afdeling 1 + 2) og sine uændrede LMGT3-resultater.
- En ny testtilmelding efter afdeling 2 giver 2 × 8 point i valgt klasse; efter afdeling 3 uploades, får køreren normalt resultat der, og tiltrædelsesrækkerne for afdeling 1–2 bevares.
- "Genberegn point" og gen-upload af en resultatfil ændrer ikke tiltrædelsesrækker.
