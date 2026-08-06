# Forside-resultater, afdelings-dropdown, team-stilling og topbar

## 1. Forsiden viser den senest afsluttede afdeling

I dag vælger forsiden den afdeling med den seneste løbsdato blandt de afsluttede. Det skal i stedet være den afdeling, der senest er blevet meldt afsluttet – uanset om det skete automatisk (ved upload af resultatfil) eller manuelt i kontrolpanelet.

- Der gemmes et tidsstempel, når en afdeling markeres som afsluttet: både ved automatisk afslutning via resultat-upload og ved det manuelle "Marker som afsluttet"-flueben.
- Forsiden sorterer efter det tidsstempel (nyeste først). Gamle afdelinger uden tidsstempel falder tilbage til løbsdatoen, så de fortsat vises i rigtig rækkefølge.
- Både hovedkortet og listen "øvrige resultater" bruger samme rækkefølge.

## 2. Dropdown til afsluttede afdelinger på ligasiden

For ligaer uden samlet stilling (fx Pre-Season Shakedown) står alle afdelinger i dag i én lang række nederst.

- Erstattes af én afdelings-vælger (dropdown) øverst i resultatsektionen. Standardvalg = den senest afsluttede afdeling.
- Når man vælger en afdeling, vises kun den afdelings resultater: klasse-tabeller (points, FL, straf) samt Quali/Race-fanen fra resultatfilerne for netop den afdeling.
- Quali/Race-skiftet bliver liggende ved siden af dropdownen, så man kan skifte mellem de to uden at miste valget.
- Ligaer med samlet stilling er uændrede (kumulativ tabel med kolonne pr. afdeling), men deres "Resultatfiler"-sektion får også afdelings-dropdownen i stedet for en lang liste.

## 3. Team-stilling følger samme princip som solo

- Har ligaen samlet stilling: team-stillingen samles som nu.
- Har ligaen stilling pr. afdeling: team-stillingen vises også kun pr. afdeling, styret af samme dropdown – ingen sammenlagt totalkolonne.

## 4. Topbar på PC

Menuen sidescroller i dag på almindelige skærme.

- Menupunkterne opdeles i primære (Hjem, Ligaer, Leaderboard, Teams) som altid er synlige, og sekundære (Brugere, Partnerfordele, Feedback, Coaching) som samles i et diskret "Mere"-menupunkt, når der ikke er plads.
- På brede skærme (xl og op) vises alle punkter direkte uden dropdown.
- Indholdsbredden øges lidt, og vandret scroll fjernes, så udtrykket forbliver roligt og ensartet. Mobilmenuen er uændret.

## Teknisk

- `settings.completed_at` sættes i `src/lib/league-results.functions.ts` (auto) og i afdelings-redigeringsdialogen i `src/routes/_authenticated._admin.admin.ligaer.$leagueId.afdelinger.tsx` (manuelt). Ingen databasemigrering nødvendig – feltet ligger i det eksisterende `settings`-JSON.
- `src/routes/index.tsx`: sortering i `home-recent-results` efter `completed_at ?? race_date`.
- `src/routes/ligaer.$leagueId.index.tsx`: fælles `selectedDivisionId`-state deles mellem `Standings`, `TeamStandings` og `RaceDataResults`; `RaceDataResults` filtrerer på valgt afdeling i stedet for at gruppere over alle.
- `src/components/AppHeader.tsx`: nav-items får et `primary`-flag; sekundære punkter renderes i en `DropdownMenu` ("Mere") under `xl`.
