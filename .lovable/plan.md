# Synlig drop-streg, point i stedet for placering, og ingen tankestreger

## Ændringer på ligasidens stillinger (`src/routes/ligaer.$leagueId.index.tsx`)

### 1. Fysisk skrå/liggende streg over drop-runden

- I dag bruges CSS-overstregning, som ikke rammer mærker som DNS/DNF/TP.
- Erstattes af en synlig streg hen over hele cellen (et absolut placeret streg-element midt i cellen), så man tydeligt kan se, at netop den afdeling er stroget — uanset om cellen viser point eller et mærke.

### 2. Point i stedet for placering i stillingscellerne

- Kørerstillingens afdelingskolonner viser i dag placeringen (1, 2, 3 …). De viser i stedet **rundens point**.
- RET-runder viser point + RET-mærket som nu. DNS/DNF/DSQ/TP viser fortsat deres mærker (de giver alligevel 0 point, og mærket fortæller hvorfor).

### 3. Fjern tankestregerne ("–")

- Cellen for en afdeling køreren ikke deltog i: tom i stedet for "–".
- Straf-kolonnen: tom når der ingen tidsstraf er — de røde "+12s"-værdier bevares.
- Pt-straf-kolonnen: tom når der ingen pointstraf er — de røde "-2"/"-4"-værdier bevares.
- Team-stillingens "–"-celler (runder uden point) bliver ligeledes tomme.

## Tekniske detaljer

- `Standings`: cellen renderer `cell.points` i stedet for `cell.position`; drop-cellen får `relative` + et streg-element (`<span className="absolute inset-x-0 top-1/2 h-px bg-muted-foreground/70" />`) i stedet for `line-through`-klassen. `position`-feltet i `rounds` beholdes (bruges til sortering/tooltip andre steder).
- `TeamStandings`: "–"-cellen bliver tom (titel om årsagen beholdes som tooltip).
- Straf-/Pt-straf-kolonnerne: `"–"` erstattes af tom streng; de røde værdier (`text-destructive`) røres ikke.
- Verificering: byg + visuel test af ICE Cup-stillingen i previewet (streg synlig på drop-celler, point i cellerne, ingen tankestreger).
