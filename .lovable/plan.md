# Ret streambillede og flytning mellem team-lineups

## Bekræftede årsager

### Streambillede
Sikkerhedsreglen for profilopdateringer kontrollerer donationsfelter, som almindelige brugere ikke længere må læse. Derfor afvises hele profilopdateringen efter upload, og profilen kan ikke gemme henvisningen til det nye billede.

### Kenneth Dahl i Odyssé
Databasen viser, at Kenneth allerede er fjernet fra Odyssés LMGT3-lineup (`effective_until` er sat 19. september). Han står derfor kun som historisk medlem, selv om visningen stadig kan få det til at ligne et aktivt lineup. Hans team-klasse er allerede LMP2, og hans aktive ligatilmelding er LMP2.

Der er desuden en konkret fejl i den fælles lineup-lås: den medregner historiske lineup-rækker uden at kontrollere slutdatoen. Det kan få fjernede kørere til fortsat at fremstå låst til deres gamle lineup.

## Ændringer

### 1. Gør profilopdatering mulig igen
- Forenkle reglen for opdatering af egen profil, så den ikke læser de skjulte donationsfelter.
- Behold beskyttelsen mod selvgodkendelse.
- Behold den eksisterende ekstra sikring, der forhindrer almindelige brugere i at ændre donationer og præstationer.
- Donationsoplysninger forbliver skjulte.
- Sørg for, at appens billedgrænse matcher lagerets præcise 10 MB-grænse.

### 2. Ret lineup-låsen
- Historiske lineup-rækker med en slutdato må ikke længere gøre en kører aktiv eller låst.
- Kun accepterede rækker uden slutdato i en aktiv liga kan låse en kører.
- Historiske teampoint bevares uændrede via start- og slutdatoerne.

### 3. Gør flytningen tydelig og sikker
- Bevar den nuværende visning, hvor fjernede kørere kun står under historik og ikke tæller som aktive; gennemgangen viser, at denne filtrering allerede er korrekt.
- Når låsen er rettet, skal Kenneth kunne vælges til LMP2, selv om hans historiske LMGT3-række bevares.
- Bevar den eksisterende genindlæsning efter tilføjelse og fjernelse; den er allerede korrekt koblet til lineup-dataene.

## Kontrol
- Log ind som almindelig bruger, skift streambillede, genindlæs siden og bekræft, at det nye billede stadig vises.
- Log ind som Daniel Kokborg og bekræft, at Kenneth ikke står aktivt i LMGT3.
- Tilføj Kenneth til Odyssés LMP2-lineup og genindlæs; han skal fortsat stå aktivt i LMP2 og kun historisk i LMGT3.
- Kontrollér, at tidligere teamresultater er uændrede, og at kommende resultater kun bruger det aktive LMP2-lineup.
- Kontrollér, at donationsfelter fortsat hverken kan læses eller ændres af almindelige brugere.

## Teknisk
- Databaseændring: erstat `Users can update own profile` med en regel, der kun kontrollerer ejerskab og uændret `approved`; triggeren `prevent_privileged_profile_field_edits` beskytter fortsat donationer/præstationer.
- Databaseændring: opdater `user_locked_team`, så den kræver `league_team_lineup.effective_until IS NULL`.
- Ingen unødvendig ændring af lineup-visningen: den filtrerer allerede korrekt på aktive rækker og genindlæser efter ændringer.
- Ingen ændring i den eksisterende historiske team-pointberegning.
