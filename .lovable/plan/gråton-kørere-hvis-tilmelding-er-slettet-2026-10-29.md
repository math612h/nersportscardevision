## Gråton kørere hvis tilmelding er slettet

**Hvad er der sket:** Daniel Kokborg, Thomas Colditz, Jesper Von Ringsten (og også Mathias Kristensen) har ikke nogen tilmelding til ICE Cup længere. Deres tilmeldinger blev slettet helt i september, før "Udmeld" begyndte at gemme tilmeldingen med en mærkat. Siden kigger kun efter tilmeldinger med mærkaten "udmeldt", så de fire bliver ikke gråtonet.

**Optager de en plads?** Nej. De har ingen tilmelding, så de tæller ikke med i antallet af pladser og blokerer ikke ventelisten. De står kun i stillingen, fordi de har kørt Silverstone (Daniel 21p, Thomas 15p, Jesper DNS 0p). Pointene får de lov at beholde, ligesom andre udmeldte.

**Rettelse:**
- I stillingerne på ligasiden bliver en kører også gråtonet og får "Udmeldt af ligaen", når han har resultater, men ikke har nogen tilmelding til ligaen. Det sker for alle de fire på én gang.
- Pointene og placeringerne ændres ikke.

### Teknisk
- `src/routes/ligaer.$leagueId.index.tsx` `withdrawnSet`: tilføj `user_id|car_class`-nøgler fra stillingsrækkerne, hvor der ikke er nogen række i `leagueEntries` for den kører/klasse.
- Ingen ændringer i databasen.
