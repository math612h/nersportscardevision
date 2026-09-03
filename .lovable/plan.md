# Filter på protest-oversigten i kontrolpanelet

## Svar på dit spørgsmål

Ja — flowet fremover er:

1. Upload race-fil fra PRO-serveren og AM-serveren på stillinger-siden → preview viser flettede klasser korrekt (omgange, derefter tid), med ligaens egen pointtabel og 70%-reglen.
2. Tryk "Vis resultater" for at udgive, bekræft når alt stemmer.
3. Steward-straffe gives på protest-siden — de beregnes nu på serveren med ligaens pointtabel og synkroniseres automatisk begge steder stillinger læses fra. En ændret afgørelse erstatter den gamle straf i stedet for at lægge oveni.

En enkelt ting at være opmærksom på: hvis I ændrer en kørers Pro/Am-kategori efter upload, bør resultaterne uploades igen (eller "Genberegn point" bruges), så kategorien følger med.

## Ny funktion: filtrering af protester

På /admin/protests tilføjes to dropdowns over listen:

- **Liga**: "Alle ligaer" + én pr. liga der har protester.
- **Afdeling**: "Alle afdelinger" + afdelingerne i den valgte liga (deaktiveret/indskrænket når en liga er valgt).

Listen filtreres med det samme, uden genindlæsning — dataen (liga- og afdelingsnavn) hentes allerede i dag, så der er ingen ekstra databasekald. Valgene huskes i URL'en som søgeparametre, så et link/fane kan deles med filteret intakt.

Som standard vises åbne sager øverst som i dag.

## Teknisk

- `src/routes/_authenticated._admin.admin.protests.index.tsx`: udled unikke ligaer/afdelinger fra det hentede protest-svar, lokal state (useState) for valgt liga/afdeling, `validateSearch` på routen så filtre kan deles via URL. Filtrering sker client-side på det eksisterende datasæt.
- Ingen databaseændringer.
