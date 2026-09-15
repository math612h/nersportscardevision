# Reserve kan ikke acceptere pladsen

## Hvad der sker

Mathias Gylden har et aktivt reservetilbud til "Afdeling 2 - Interlagos" (LMGT3 Pro), men når han trykker "Accepter pladsen" i Discord, svarer botten:

`duplicate key value violates unique constraint "entries_league_car_number_uniq"`

Årsagen er bekræftet i databasen: kørernumre er gjort unikke pr. liga på tværs af **alle** tilmeldingsrækker, også de afdelings-rækker der oprettes når en reserve accepterer. Reserven har allerede en ligatilmelding med sit nummer, så den nye afdelings-række med samme nummer bliver afvist. Det rammer enhver reserve, ikke kun Mathias — der findes i dag ingen afdelings-rækker overhovedet, så accept har aldrig kunnet lykkes.

## Hvad der rettes

- Reserver kan acceptere en plads igen, og de beholder deres eget kørernummer.
- Kørernumre er fortsat unikke pr. liga — to kørere kan stadig ikke få samme nummer.
- Hvis noget alligevel går galt ved accept, får køreren en forståelig besked i stedet for en teknisk fejltekst.
- Mathias' tilbud er stadig gyldigt (udløber i nat), så han kan trykke accepter igen bagefter.

## Teknisk

**Migration**
- Genskab det unikke indeks `entries_league_car_number_uniq` med den ekstra betingelse `division_id IS NULL`, så nummer-unikheden gælder ligatilmeldinger (griddet), ikke afdelings-rækker for reserver.

**Server**
- `src/lib/division-reserves.server.ts` (`respondReserveOfferCore`): behold indsættelse af `car_number` fra ligatilmeldingen; ved en eventuel unik-konflikt prøv igen uden `car_number` i stedet for at fejle.
- `src/routes/api/public/discord.interactions.ts`: ved fejl under accept vises en dansk besked ("Kunne ikke bekræfte reservepladsen — prøv på hjemmesiden") i stedet for den rå databasefejl.
