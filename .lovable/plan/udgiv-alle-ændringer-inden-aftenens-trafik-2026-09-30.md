# Udgiv alle ændringer inden aftenens trafik

## Formål
Sæt den seneste version live, så den offentlige side (lmudanmark.dk) får alle forhåndsvisnings-ændringerne, før der kommer ca. 100 samtidige besøgende.

## Indeholder (allerede implementeret og testet)
1. Forside: liga-knappen hedder "LMU Danmark ICE Cup" og går direkte til ligaen
2. Forside: "Seneste livestream" med YouTube-thumbnail over "Seneste løb"; livestream erstatter "Seneste løb" når I går live
3. Ugens Overhaling og "Tidligere løb" fjernet fra forsiden
4. Tilbageknapper siger "Tilbage til forsiden"
5. Practice sessions synlige for alle; koder fra 3 t før til 6 t efter start
6. Standard streambillede (hjelmen) i stedet for Discord-avatar
7. Rettelser: team-lineup fjernelse/tilføjelse, hop til forsiden, stewards kan afgøre protester, strafpoint lægges ikke oveni ved gentagen gemning

## Trin
1. Kig hurtigt på build-status (ingen fejl) inden udgivelsen
2. Udgiv projektet (alle ændringer ovenfor med i deployment)
3. Verificér at den offentlige side svarer (HTTP 200) og viser den nye forside
4. Husk til aftenen: tjek credits-saldoen, da høj trafik forbruger hurtigere (sidst gik databasen på pause af den grund)

## Ingen kode- eller databaseændringer
Alt er allerede bygget — planen handler kun om at udgive og verificere.
