# Hvorfor Daniel ikke kan tilføje kørere i Odyssé Cronos Racing

## Hvad jeg har tjekket

- Teamet har to team-tilmeldinger i ICE Cup: LMP2 (2 kørere på lineupet) og LMGT3 (4 kørere).
- Mathias Gylden opfylder alle krav: han er teammedlem med klassen LMGT3 og er selv tilmeldt LMGT3 i ICE Cup. Han er ikke låst til et andet team.
- Der er ingen regel i databasen, der blokerer tilføjelsen — hverken adgangsregler eller lås på ligaen.

Så selve funktionen ville virke; problemet er at knappen "Tilføj kører" ikke er synlig for Daniel ude på det offentlige site.

## Årsag

Muligheden for at tilføje kørere midt i sæsonen blev bygget, men den nye version er ikke sendt live endnu. Derfor ser Daniel stadig den gamle teamside uden "Tilføj kører"-knappen.

## Plan

1. Åbn teamsiden i preview som teamejer og bekræft, at "Tilføj kører" står ud for både LMP2- og LMGT3-tilmeldingen, og at Mathias Gylden kan vælges under LMGT3.
2. Hvis knappen mangler i preview også: undersøg den forespørgsel, teamsiden bruger til at hente tilmeldingerne, og ret fejlen, så listen (og dermed knapperne) vises.
3. Udgiv appen, så Daniel får versionen med knappen.
4. Bagefter kan Daniel selv tilføje Mathias Gylden — han tæller først med i teamets resultater fra næste afdeling.

## Bemærkning

Under LMP2 kan der ikke tilføjes flere lige nu: Dennis Meisner og Mikkel Buch-hauritz er de eneste teammedlemmer med LMP2. Flere kræver, at de først får LMP2 tildelt på teamsiden og selv er tilmeldt LMP2 i ligaen.
