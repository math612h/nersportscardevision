# Aktivitetslog: afdelingsfilter + klasse på afbud

## Problemer

1. **Intet afdelingsfilter** — siden har kun søgning, hændelsestype, klasse og datointerval.
2. **LMGT3 + "Afbud & reserver" giver tomt resultat** — afbud-hændelser oprettes med `carClass: null`, så klassefilteret (LMGT3/LMP2) frasorterer dem alle. Kun reserve-tilbud har klasse.

## Ændringer (kun `src/routes/_authenticated._admin.admin.ligaer.$leagueId.aktivitet.tsx`)

### Fix: klasse på afbud
- Hent ligaens `entries` (`user_id, car_class, driver_category`) i den eksisterende query.
- Byg et opslag `userId → klasse`; brug det til at sætte `carClass` på afbud-hændelser (og som fallback på hændelser, der mangler klasse).
- Resultat: filter "LMGT3" + "Afbud & reserver" viser nu LMGT3-kørernes afbud og reserve-tilbud.

### Nyt: afdelingsfilter
- Hændelser, der hører til en afdeling (afbud og reserve-tilbud), får `divId` sat fra `division_id`.
- Ny dropdown "Afdeling" med valgene: Alle afdelinger + én pr. afdeling (navn fra `divisions`, sorteret efter dato).
- Når en specifik afdeling vælges, vises kun hændelser knyttet til den afdeling (afbud/reserver). Liga-dækkende hændelser (tilmeldinger, klasseskift, team-rokader) er ikke bundet til én afdeling og vises derfor kun under "Alle afdelinger".
- Filtergitteret udvides fra 4 til 5 kolonner på desktop; på mobil stables filtrene som nu.

## Hvad der ikke ændres

- Ingen database- eller rettighedsændringer; kun læsning af eksisterende data.
- Badge-tælleren på liga-knappen og øvrige filtre fungerer som før.

## Verifikation

- Typecheck/build.
- Hurtig gennemgang af filtrene: LMGT3 + Afbud & reserver viser nu hændelser; afdelingsfilter indsnævrer korrekt.
