# Rediger bane og layout på eksisterende afdeling

## Hvad der skal bygges

I kontrolpanelet under **Afdelinger** kan man i dag redigere dato, temperatur, lobby-oplysninger og event settings via blyant-ikonet — men ikke bane og layout. Det tilføjes:

- Dialogen "Rediger afdeling" (blyant-ikonet) får samme bane- og layout-vælger som ved oprettelse: en dropdown med alle baner og deres layouts.
- Vælgeren er udfyldt med afdelingens nuværende bane og layout, når dialogen åbnes.
- Ved gem opdateres afdelingens bane og layout sammen med de øvrige felter.

## Detaljer

- Ændringen sker i `EditDivisionDialog` i admin-afdelingssiden — samme dropdown-komponent og data (`LMU_TRACKS`) som bruges ved oprettelse af afdeling.
- Hvis afdelingens gemte bane ikke findes i banelisten (fx en ældre/ukendt bane), starter vælgeren på første bane, så admin bevidst vælger den rigtige.
- Baneændring påvirker kun fremadrettet visning (kalender, afdelingsside, banebillede). Allerede uploadede resultater og point ændres ikke — de gemte resultatrækker røres ikke.
- Ingen database- eller rettighedsændringer.

## Ud over planen

- Ingen advarsler eller lås på afviklede afdelinger — admin kan frit rette banen, også efter løbet er kørt.
