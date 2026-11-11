# Bogføringsmodul for LMUdanmark

## Hvad findes i dag
- Stripe-forbindelsen bruges til to betalingstyper: donationer og coaching. Webhooken registrerer `checkout.session.completed` og `async_payment_*` i `donations` og `coaching_bookings`.
- Admin-siden "Betalinger" viser donationer og et Stripe-overblik.
- Roller ligger i `user_roles` (admin, steward m.fl.) og tjekkes med `private.has_role`.
- Der er ingen kontingentbetaling i dag. Modulet laver en regel for kontingent, men opretter ikke selv et betalingsflow.
- Det nuværende betalingsflow og webhookens adfærd for donationer og coaching ændres ikke. Bogføringen lægges ovenpå.
- Automatisk bogføring er slået fra, indtil kassereren har godkendt regler, skæringspunkt og åbningsposter. Databasen håndhæver det.

## 1. Grundlag
- Nye økonomiroller oven på de eksisterende admin-roller: `finance_admin` (kasserer) og `finance_approver` (bestyrelse). Adgangen begrænses både i databasen (RLS) og i serverfunktionerne.
- Foreningsindstillinger: navn, kalenderår som regnskabsår, stiftelsesdato 10/11-2026, kasserer og skæringspunkt. Skæringspunktet skal godkendes.
- Kontingentsats med historik og ikrafttrædelsesdato. Første sats er 150 kr. for 6 måneder.
- Kontoplan med alle de ønskede konti.
- Dobbelt bogholderi: kladder, journalposter og posteringslinjer. Beløb gemmes i øre som heltal.
  - En post kan kun bogføres, når debet og kredit balancerer.
  - Bogførte poster kan ikke ændres eller slettes. Rettelser sker med tilbageførsel og en ny post.
  - Andre valutaer end DKK kræver en dokumenteret kurs med kilde.
- Alle bogføringskilder bruger samme motor: Stripe, manuelle udgifter, leverandørgæld, udlæg, bankbevægelser og åbningsposter.
- Månedlige og årlige perioder kan låses. Genåbning kræver rettighed og begrundelse og bliver logget.
- Log over ændringer og godkendelser med person, tidspunkt og handling.

## 2. Stripe-synkronisering
- **Rettighedstjek:** Modulet tjekker adgangen til balance transactions, balance, charges, refunds, disputes, payouts, invoices og checkout sessions. Det viser præcist, hvad der mangler.
- **Historikimport:** Import med pagination, der kan genoptages. Test og live holdes adskilt.
- **Rådata:** Gemmes med en unik nøgle pr. konto, miljø og Stripe-ID.
- **Webhook:**
  - Signaturen kontrolleres på serveren.
  - Events gemmes i en indbakke med unik event-ID.
  - Hvert event behandles ved at hente objektet frisk fra Stripe, så forsinkede events og forkert rækkefølge ikke giver fejl.
- **Kontrolsynkronisering (dagligt):**
  - Henter de seneste 35 dage.
  - Følger desuden alle uafklarede objekter uanset alder, indtil de er afklaret: betalinger der afventer, åbne disputes, refunds der afventer, og payouts under vejs.
  - Fejl logges, og der er en knap til sikker genkørsel.
- **Hvad der bogføres:** Stripe-importen bogfører kun balance transactions. Session, payment intent, charge og invoice gemmes som kontekst. En invoice bliver aldrig selv til indtægt.
- **Dubletbeskyttelse sidder på selve bogføringen:**
  - Journalposter har en unik nøgle: Stripe-konto + test/live + balance transaction ID.
  - Bogføringen sker i én databasetransaktion, der springer eksisterende poster over.
  - Samtidige imports og genkørsler giver derfor kun én post.
- **Behandling af typer:** Styres af `reporting_category`, `type`, beløb, gebyrdetaljer og kildeobjekt.
  - Charge: brutto til indtægt, faktisk Stripe-gebyr til gebyrkontoen, netto til Stripe-beholdning.
  - Fulde og delvise refunds samt refunds der fejler.
  - Disputes, dispute-gebyrer, vundne disputes og tilbageførsler.
  - Payouts (Stripe til Overførsler undervejs) og fejlede payouts.
  - Forsinkede betalingsmetoder som SEPA, også når de fejler bagefter. Tilbageførslen bogføres modsat via sin egen balance transaction.
  - En betaling bliver først indtægt, når Stripe har bekræftet den.
  - Ukendte typer og ukendte kategorier sendes til "Kræver kontrol".
- **Før skæringspunktet:** Transaktioner markeres "Historik – kun dokumentation" og bogføres aldrig automatisk.

## 3. Kategorisering
- Regelside, hvor regler matcher på product-ID, price-ID/lookup_key eller metadata. Reglerne har en prioriteret rækkefølge, og hver post viser hvilken regel der blev brugt.
- Ingen regler ud fra beløb alene. Hvis ingen eller flere regler matcher, bliver posten "Kræver kontrol".
- Forslag til startregler oprettes som inaktive og venter på kassererens godkendelse.
- AI kan foreslå kategorier og udtrække oplysninger fra bilag.
  - Forslaget viser hvor sikkert det er, og hvilken tekst det bygger på.
  - Felter AI ikke kan læse, forbliver tomme.
  - Alle forslag skal godkendes af et menneske.

## 4. Bank, udgifter og bilag
- **Bilag:** Ligger i privat lagring med kortlivede links, kun for økonomiroller. PDF og billeder understøttes.
- **Udgifter og fakturaer:** Registreres med leverandør, dato, beløb, valuta, kategori, hvem der har betalt (forening eller privatperson) og betalingsstatus.
  - En faktura bogføres som leverandørgæld.
  - Betalinger bogføres særskilt, også som delbetalinger.
  - En kvittering er ikke i sig selv bevis for betaling.
- **Bankimport (CSV):** Kolonnemapping og forhåndsvisning før import.
  - Bankens transaktions-ID bruges, når det findes.
  - Ellers bruges et fingeraftryk med løbenummer for gentagne linjer. To ægte identiske betalinger bevares begge.
  - Mistænkte dubletter vises til manuel afgørelse og slettes aldrig automatisk.
- **Matching:**
  - Bankindsætning mod Stripe-payout: Overførsler undervejs til Bank, ingen ny indtægt.
  - Bankposter mod fakturaer og udlæg, også flere poster mod én betaling.
  - Direkte bankindbetalinger som sponsorater registreres med kategori.
- **Opgaveliste:** Manglende bilag, uafstemte bankposter, "Kræver kontrol" og synkroniseringsfejl.

## 5. Private udlæg
- Udlægshaveren indsender kravet med bilag.
- Andre godkendelsesberettigede behandler kravet. Databasen afviser at man godkender sit eget udlæg.
- Et godkendt udlæg bogføres som udgift mod Gæld til udlægshaver.
- Tilbagebetalinger nedbringer gælden og kan ske i rater. Restgælden vises.
- Modulet udfører ingen udbetalinger, bankoverførsler eller refunds.

## 6. Åbning af regnskabet (forhåndsvisning)
- Modposterne i åbningskladderne er kun forslag. Kassereren vælger og godkender dem ud fra de faktisk overtagne aktiver, forpligtelser og udgifter. Egenkapital vælges ikke automatisk.
- **Kladde A – overtaget beholdning:**
  - 1.374,74 kr. pr. 10/11-2026.
  - Aktivkontoen vælges ud fra, hvor pengene faktisk står: bank, Stripe eller tilgodehavende.
  - Placering og dokumentation skal angives, før kladden kan bogføres.
- **Kladde B – udlægsopgørelse fra 4/11-2026:**
  - Foreløbigt 7.414,65 kr. Beløbet indeholder kun udlæg, der endnu ikke er tilbagebetalt. Tidligere tilbagebetalinger trækkes ikke fra igen.
  - Opgørelsen og kvitteringerne gemmes som dokumentation for restgælden. De bogføres ikke som nye driftsudgifter.
  - Kladden krediterer Gæld til udlægshaver. Modposten vælges og godkendes af kassereren.
  - Det endelige beløb skal afstemmes, og de øvrige bestyrelsesmedlemmers godkendelser skal registreres, før kladden kan bogføres.
- A og B er to separate poster.
- Historiske Stripe-udbetalinger før skæringspunktet nedskriver ikke gælden. Kun fremtidige, bekræftede tilbagebetalinger gør.
- Automatisk bogføring kan først slås til, når skæringspunkt, regler og begge kladder er godkendt.

## 7. Afstemning, rapporter og eksport
- **Stripe-afstemning:** Bogført beløb sammenlignes med Stripes saldo, opdelt i pending, available og eventuelle reserver pr. valuta.
- **Bankafstemning:** Bogført saldo på kontoudtogets dato sammenlignes med kontoudtogets saldo.
- **Differencer:** Vises i kroner, og man kan åbne de bagvedliggende poster.
- **Status:** Seneste synkronisering, kontrollerede perioder og overførsler undervejs.
- **Rapporter:** Resultatopgørelse, balance, kontospecifikationer, journal, indtægter pr. type, udgifter pr. kategori samt udlægsgæld og afdrag.
- **Afslutning:** Måneds- og årsafslutning med tre statusser: kladde, bestyrelsesgodkendt og generalforsamlingsgodkendt.
  - Godkendelser registreres af navngivne personer.
  - Systemet opretter aldrig selv en godkendelse.
- **Eksport:**
  - Årsregnskab som PDF.
  - Journal og konti som CSV.
  - Bilagsoversigt og alle bilag som ZIP.
  - Fuld dataeksport til en senere flytning, fx til Dinero.
  - Ingen nøgler i eksportfilerne.
- **Moms og skat:** Kassereren noterer sin afklaring. Der er ingen automatik og ingen indberetning.
- Modulet beskrives som et internt værktøj, ikke som et certificeret system.

## 8. Backup (kontrolleres konkret)
- **Database:** Lovable Cloud tager én daglig backup af databasen og gemmer den i ca. 14 dage. Den gendanner kun hele databasen på én gang.
- **Bilagsfiler:** De er ikke med i den daglige backup.
- **Fuld eksport fra modulet:**
  - Indeholder alle økonomidata, alle bilagsfiler og en liste med kontrolsum (SHA-256) for hver fil.
  - Kan hentes manuelt og laves automatisk hver måned.
  - Siden "Backup-status" viser seneste eksport.
- **Afprøv gendannelse:**
  - Indlæser en eksport i et isoleret testområde.
  - Kontrollerer antal rækker, at alle poster balancerer, saldi pr. konto og filernes kontrolsum.
  - Resultatet logges. Testen køres og rapporteres ved afleveringen.
- **Gendannelse fra den daglige databasebackup:** Den overskriver produktionen og kan ikke afprøves sikkert her. Den beskrives som en manuel handling og meldes ikke som testet.

## Brugerflade
Ny sektion "Regnskab" i kontrolpanelet med disse undersider: Overblik/opgaver, Journal, Kladder, Stripe, Bank, Udgifter & bilag, Udlæg, Regler, Afstemning, Rapporter & eksport, Perioder, Backup, Indstillinger og Log.

## Test
Vitest-tests af bogføringslogikken:
- Betaling med særskilt gebyr.
- Samme event modtaget to gange.
- Samtidig bogføring af samme balance transaction giver kun én post.
- Samme betaling via flere Stripe-objekter giver kun én indtægt.
- Historikimport efterfulgt af webhook for samme transaktion.
- Delvis refund.
- Dispute med tilbageførsel.
- Forsinket betaling, der fejler bagefter.
- Payout matchet til bank uden ny indtægt.
- Gentagne identiske banklinjer bevares.
- Stripe-afstemning med pending, available og reserve.
- Åbningsbeholdning uden dobbeltregning af historikken.
- Udlæg med delvis tilbagebetaling.
- Bogførte poster balancerer.

SQL-tests i en transaktion, der rulles tilbage:
- En post der ikke balancerer afvises.
- En bogført post kan ikke ændres.
- Man kan ikke godkende sit eget udlæg.
- En bruger uden økonomirolle kan hverken læse eller ændre økonomidata.

## Tekniske detaljer
- Nye `fin_*`-tabeller med RLS og GRANT. Adgang via finance-rollerne.
- Unik nøgle `(stripe_account_id, environment, balance_transaction_id)` på journalposter fra Stripe.
- Triggers til: balance, uforanderlige bogførte poster, låste perioder, selvgodkendelse og automatisk bogføring der kræver godkendt opsætning.
- Ren, testbar logik i `src/lib/finance/*.ts`. Serverfunktioner i `*.functions.ts`. Stripe kaldes via `createStripeClient`.
- I den eksisterende webhook tilføjes kun et kald, der lægger eventet i indbakken. Det isoleres med try/catch, så de nuværende handlers ikke påvirkes. Nye event-typer tilmeldes via `edit_webhook`.
- Cron-endpoint `/api/public/cron/finance-sync` med `authorizeCron`.
- PDF laves med pdf-lib og ZIP med fflate. Testgendannelsen bruger et separat skema.
- To nye regler i AGENTS.md:
  - Stripe-importen bogfører kun balance transactions, unikt pr. konto og miljø.
  - Automatisk bogføring forbliver slået fra, indtil opsætningen er godkendt.

## Hvad du skal gøre bagefter
- Tildele økonomiroller til kasserer og godkendere.
- Uploade bank-CSV og udlægsopgørelsen med kvitteringer.
- Godkende regler, skæringspunkt og åbningskladder.
- Afklare moms og skat.
