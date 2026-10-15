# Kører­nummer med egen visning i stillingerne

## Problem
Køre­nummeret i stillingstabellen står som almindelig tekst mellem kørernavn og afdelingsresultaterne, så det flyder visuelt sammen med resten af rækken.

## Løsning
I `src/routes/ligaer.$leagueId.index.tsx` (Standings-tabellen):

- Køre­nummeret vises som en lille badge: afrundet boks med svag baggrund (`bg-muted`) og tydelig tekstfarve, fast bredde og centreret — så det ligner et "nummerplade"-element frem for almindelig tekst.
- Nummeret bliver i samme kolonne ("Nr."), men med badge-udseendet skilles det klart fra point, placeringer og navne.
- Bruger kun semantiske farvetokens fra temaet (ingen hardkodede farver), så det virker i både lyst og mørkt tema.

## Omfang
- Kun kører-stillingstabelen på ligaens forside. Ingen ændringer af data, sortering eller beregning.
