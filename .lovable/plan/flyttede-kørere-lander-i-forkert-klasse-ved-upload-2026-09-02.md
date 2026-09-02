# Flyttede kørere lander i forkert klasse ved upload

## Hvad jeg fandt

Kenneth Dahl Pedersens tilmelding blev ændret fra Am til Pro kl. 00:16 (dansk tid) i aften — det står korrekt i databasen nu. Der er endnu ingen gemte resultater på nogen ICE CUP-afdeling, så problemet sidder i "Stillinger"-siden, ikke i de gemte data.

To ting gør at en flytning ikke slår igennem:

1. Kørerlisten i Stillinger hentes én gang og bygges om, når man skifter afdeling — ikke når tilmeldingerne ændrer sig. Har man siden åben (eller i en anden fane) mens man flytter kørere i Tilmeldinger, arbejder upload-vinduet videre på den gamle Pro/Am-opdeling.
2. Tidligere gemte resultater kobles til køreren via nøglen klasse + kategori + bilnummer. Flytter man en kører mellem Pro og Am, passer nøglen ikke længere, så tidligere indtastede tider/straffe for den kører falder ud.

## Hvad der ændres

1. Stillinger-siden henter tilmeldingerne friskt, når man åbner siden og når vinduet får fokus igen, så en netop udført flytning altid er med.
2. Kørerlisten bygges om, når tilmeldingerne ændrer sig (ikke kun ved skift af afdeling). Allerede indtastede/importerede tider i det åbne vindue bevares — kun klasse og kategori opdateres.
3. Sammenkobling af gemte resultater med kørere sker på bruger-id (med bilnummer som reserve) i stedet for klasse + kategori + bilnummer, så en Pro/Am-flytning ikke længere smider data på gulvet.
4. En lille advarsel øverst i Stillinger, hvis tilmeldingslisten er blevet ændret siden siden blev åbnet, med en "Genindlæs"-knap.

Efter dette vil en kører der er flyttet til Pro også blive placeret i Pro-gruppen i preview og i de gemte resultater — uanset hvilken serverfil hans tid kom fra.

## Teknisk

- `src/routes/_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx`:
  - `league-entries-for-standings`-query får `staleTime: 0` + `refetchOnMount: "always"` og `refetchOnWindowFocus: true`.
  - `DivisionEditor`: `useEffect` afhænger også af en signatur over entries (`id|car_class|driver_category|car_number`); ved ændring merges nye entry-felter ind i eksisterende `rows` i stedet for at nulstille.
  - `raceByKey`/`qualiByKey` og opslaget omkring linje 1155 nøgles på `user_id` med fallback til `car_number`.
- Ingen databaseændringer og ingen ændring i selve flette-logikken for PRO/AM-filer.
