# Synlig drop-streg, placering + point i cellerne, og ingen tankestreger

## Ændringer på ligasidens stillinger (`src/routes/ligaer.$leagueId.index.tsx`)

### 1. Fysisk streg over drop-runden

- I dag bruges CSS-overstregning, som ikke rammer mærker som DNS/DNF/TP.
- Erstattes af en synlig streg hen over hele cellen (et absolut placeret streg-element midt i cellen), så man tydeligt kan se, at netop den afdeling er stroget — uanset om cellen viser tal eller et mærke.

### 2. Placering OG point i hver celle — pænt kolonneopdelt

- Kørerstillingens afdelingskolonner viser i dag kun placeringen. De viser fremover **både placering og rundens point** i hver celle.
- Layout i cellen: placering og point står på samme linje med fast afstand (fx "1 · 30"), centreret og med samme tabulære talbredde, så tallene står pænt ned ad kolonnerne.
- Kolonnebredden øges en smule, så begge tal har plads uden at trykke tabellen.
- RET-runder viser placering + point + RET-mærket. DNS/DNF/DSQ/TP viser fortsat deres mærker (de fortæller hvorfor der ikke står tal).

### 3. Fjern tankestregerne ("–")

- Cellen for en afdeling køreren ikke deltog i: tom i stedet for "–".
- Straf-kolonnen: tom når der ingen tidsstraf er — de røde "+12s"-værdier bevares.
- Pt-straf-kolonnen: tom når der ingen pointstraf er — de røde "-2"/"-4"-værdier bevares.
- Team-stillingens "–"-celler (runder uden point) bliver ligeledes tomme.

### 4. Visuelt polish

- Afdelingskolonnernes overskrifter ("Afd. 1" / baneforkortelser) centreres over det nye celleindhold, og cellernes lodrette placering ensrettes, så tabellen fremstår rolig og ensartet — også på mobil.

## Tekniske detaljer

- `Standings`: cellen renderer `cell.position` + `cell.points` (fx `1 · 30`) i en lille flex-række med `tabular-nums`; drop-cellen får `relative` + et streg-element (`<span className="absolute inset-x-0 top-1/2 h-px bg-muted-foreground/70" />`) i stedet for `line-through`-klassen.
- `TeamStandings`: "–"-cellen bliver tom (årsagen beholdes som tooltip).
- Straf-/Pt-straf-kolonnerne: `"–"` erstattes af tom streng; de røde værdier (`text-destructive`) røres ikke.
- Verificering: byg + visuel test af ICE Cup-stillingen i previewet (streg synlig på drop-celler, placering + point i cellerne, ingen tankestreger).
