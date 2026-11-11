# Bogføringsmodul for LMUdanmark

## Hvad findes i dag
- Stripe-forbindelsen bruges til to betalingstyper: donationer og coaching. Webhooken registrerer `checkout.session.completed` / `async_payment_*` i `donations` og `coaching_bookings`.
- Admin-siden "Betalinger" viser donationer og Stripe-overblik.
- Roller ligger i `user_roles` (admin, steward m.fl.) med `private.has_role`.
- Der er ingen kontingentbetaling i dag. Modulet laver derfor en regel for kontingent, men opretter ikke selv et betalingsflow.
- Det nuværende betalingsflow og webhook-adfærd for donationer og coaching røres ikke. Bogføringen lægges ovenpå som en separat lytter og synkronisering.

## Leverance i faser
Alt bygges i én omgang, men det aktiveres trinvist. Automatisk bogføring er slået fra, indtil kassereren godkender regler og skæringspunkt.

### Fase 1: Grundlag
- Ny økonomirolle (`finance_admin`, `finance_approver`) oven på de eksisterende admin-roller. Adgang til alle økonomitabeller kun via disse roller (RLS + serverfunktioner).
- Foreningsindstillinger: navn, regnskabsår, stiftelse 10/11-2026, kasserer, skæringspunkt (kræver godkendelse).
- Kontingentsats med historik og ikrafttrædelsesdato (start: 150 kr./6 mdr.).
- Kontoplan med de ønskede konti (bank, Stripe-beholdning, overførsler undervejs, tilgodehavender, leverandørgæld, gæld til udlægshavere, egenkapital, indtægts- og udgiftskonti, gebyrer, øvrige).
- Regnskabsmotor: kladder → journalposter → posteringslinjer i øre (heltal). Databasen afviser bogføring der ikke balancerer. Bogførte poster kan ikke ændres eller slettes (trigger). Rettelser sker som tilbageførsel og ny post. Fremmed valuta kræver at en kurs og dens kilde er dokumenteret.
- Perioder (måned/år) med låsning. Genåbning kræver rettighed og begrundelse og bliver logget.
- Ændrings- og godkendelseslog for alle økonomihandlinger.

### Fase 2: Stripe-synkronisering
- Tjek af rettigheder: læser balance transactions, charges, refunds, disputes, payouts, invoices og checkout sessions. Viser præcist hvad der mangler.
- Genoptagelig historikimport med pagination og cursor pr. objekttype. Test og live adskilles altid.
- Rådata gemmes pr. Stripe-ID (unik nøgle `(environment, stripe_id)`).
- Webhook: den eksisterende route verificerer allerede signaturen. Der tilføjes en idempotent event-indbakke (unik `event_id`), og events behandles ved at hente objektet frisk fra Stripe. Det gør rækkefølgen ligegyldig.
- Daglig kontrolsynkronisering (cron med den eksisterende cron-nøgle) for de seneste 35 dage. Fejllog og knap til sikker genkørsel.
- Grundprincip: kun **balance transactions** bogføres. Session, payment intent, charge og invoice gemmes som kontekst og kobles via `source`. Så kan én betaling ikke blive til flere indtægter. Invoices bogføres aldrig selv.
- Bogføringsregler pr. type: charge (brutto til indtægt, gebyr til gebyrkonto, netto til Stripe-beholdning), refund (fuld/delvis), refund_failure, dispute + dispute-gebyr, dispute vundet, payout (Stripe → Overførsler undervejs), payout_failure. Ukendte typer går til "Kræver kontrol". Mislykkede betalinger har ingen balance transaction og bliver derfor ikke indtægt.
- Transaktioner før skæringspunktet markeres "Historik – kun dokumentation" og bogføres aldrig automatisk.

### Fase 3: Kategorisering
- Regelside: match på product-ID, price-ID/lookup_key eller metadata (fx `type=donation`, `bookingId`). Prioriteret rækkefølge. Hver post viser hvilken regel der blev brugt.
- Ingen regler ud fra beløb. Hvis ingen eller flere regler matcher, bliver posten "Kræver kontrol".
- Forslag til startregler (donation-metadata og coaching-booking-metadata) oprettes som **inaktive**, indtil kassereren godkender dem.
- AI-forslag (Lovable AI): foreslår kategori og udtrækker felter fra bilag med sikkerhed og kildetekst. Felter AI ikke kan læse, efterlades tomme. Forslag skal altid godkendes.

### Fase 4: Bank, udgifter og bilag
- Privat lagerbucket `accounting-docs` (PDF og billeder). Adgang via kortlivede signerede links for økonomiroller.
- Udgifter/fakturaer med leverandør, dato, beløb, valuta, kategori, betalt af (forening/person) og betalingsstatus. Faktura bogføres som leverandørgæld. Betaling bogføres særskilt og kan deles over flere betalinger.
- Bank-CSV-import: kolonnemapping, forhåndsvisning, dubletkontrol (hash af dato+beløb+tekst+saldo). Gemmes som bankposteringer.
- Matching: bank ↔ Stripe-payout (Overførsler undervejs → Bank, ingen indtægt), bank ↔ faktura/udlæg, direkte bankindbetalinger (fx sponsorat) med kategori. Flere bankposteringer kan matches mod én betaling.
- Opgaveliste: manglende bilag, uafstemte bankposter, "Kræver kontrol", synkroniseringsfejl.

### Fase 5: Private udlæg
- Udlægshaveren indsender krav med bilag. Godkendelse sker af andre med godkenderrolle; databasen afviser selvgodkendelse.
- Godkendt udlæg: udgift (debet) / Gæld til udlægshaver (kredit).
- Tilbagebetaling (matchet bankpostering): gæld (debet) / bank (kredit). Gerne i rater, og restgælden vises. Modulet laver ingen udbetalinger.

### Fase 6: Åbning af regnskabet (forhåndsvisning)
- Opsætningskladde A, overtaget beholdning 1.374,74 kr. pr. 10/11-2026: debet den konto kassereren vælger (bank/Stripe/tilgodehavende), kredit egenkapital. Kræver at placering og dokumentation er angivet før bogføring.
- Opsætningskladde B, udlægsopgørelse 4/11-2026 (foreløbigt 7.414,65 kr., kun ikke-tilbagebetalte udlæg): opgørelsen og kvitteringerne gemmes som dokumentation. Kladden posterer egenkapital (debet) / Gæld til udlægshaver (kredit), så de ikke bliver nye driftsudgifter. Det endelige beløb skal afstemmes, og de øvrige bestyrelsesmedlemmers godkendelser skal registreres, før kladden kan bogføres.
- A og B er separate poster. Historiske Stripe-payouts før skæringspunktet nedskriver ikke gælden. Kun fremtidige bekræftede tilbagebetalinger gør.
- Skæringspunktet skal godkendes eksplicit. Når det er sket, kan automatisk bogføring slås til.

### Fase 7: Afstemning, rapporter og eksport
- Dashboard: Stripe-beholdning (bog vs. Stripe balance), bank (bog vs. sidste kontoudtogssaldo), overførsler undervejs og differencer i kr. Man kan klikke videre til de bagvedliggende poster. Viser også seneste synkronisering og kontrollerede perioder.
- Rapporter: resultatopgørelse, balance, kontospecifikation, journal, indtægter pr. type, udgifter pr. kategori, udlægsgæld og afdrag.
- Måneds- og årsafslutning med status: kladde → bestyrelsesgodkendt (registrerede godkendelser fra navngivne medlemmer) → generalforsamlingsgodkendt (dato + referat-bilag). Ingen godkendelse oprettes automatisk.
- Eksport: årsregnskab som PDF, journal og konti som CSV, bilagsoversigt og bilag som ZIP, fuld JSON/CSV-eksport til senere flytning (fx Dinero). Ingen nøgler i eksporterne.
- Moms/skat: der er kun en indstillingsside, hvor kassereren noterer sin afklaring. Ingen automatik. Modulet beskrives som internt værktøj, ikke certificeret bogføringssystem.

### Backup
- Databasen tages med i den løbende backup af Lovable Cloud. Desuden en månedlig fuld eksport (data + bilag-ZIP), som kassereren downloader. Gendannelsesprocedure beskrives i en hjælpeside i modulet.

## Brugerflade
Ny sektion "Regnskab" i kontrolpanelet med undersider: Overblik/opgaver, Journal, Kladder, Stripe, Bank, Udgifter & bilag, Udlæg, Regler, Afstemning, Rapporter & eksport, Perioder, Indstillinger, Log.

## Test
Vitest for den rene bogføringslogik (Stripe → posteringer, matching, udlæg):
betaling med gebyr; samme event to gange; samme betaling via session/PI/charge/invoice/BT → én indtægt; historikimport + webhook; delvis refund; dispute + tilbageførsel; payout ↔ bank uden indtægt; åbningsbeholdning uden dobbeltregning; udlæg med delvis tilbagebetaling; balancekontrol. Desuden SQL-tests i rullet-tilbage transaktion: ubalanceret post afvises, bogført post kan ikke ændres, selvgodkendelse afvises, ikke-økonomibruger kan ikke læse.

## Tekniske detaljer
- Nye tabeller (public, RLS + GRANT, adgang via `private.has_role` for finance-roller): `fin_settings`, `fin_membership_rates`, `fin_accounts`, `fin_periods`, `fin_journal_entries`, `fin_journal_lines`, `fin_stripe_objects`, `fin_stripe_events`, `fin_stripe_sync_state`, `fin_sync_errors`, `fin_category_rules`, `fin_bank_accounts`, `fin_bank_imports`, `fin_bank_transactions`, `fin_documents`, `fin_bills`, `fin_bill_payments`, `fin_reimbursement_claims`, `fin_claim_approvals`, `fin_matches`, `fin_approvals`, `fin_audit_log`.
- Triggers: balance ved status→posted, immutabilitet, låst periode, selvgodkendelse.
- Serverfunktioner i `src/lib/finance/*.functions.ts`. Ren logik i `src/lib/finance/*.ts` (testbar). Stripe via `createStripeClient`.
- Webhook: i den eksisterende `api/public/payments/webhook.ts` tilføjes kun et kald, der lægger eventet i indbakken (fejl her påvirker ikke de eksisterende handlers). Nye event-typer tilmeldes via `edit_webhook` (charge.*, payout.*, charge.dispute.*, refund.*).
- Cron: `/api/public/cron/finance-sync` med `authorizeCron`.
- PDF med pdf-lib, ZIP med fflate (begge kører på workerd).
- Regel i AGENTS.md: kun balance transactions bogføres; andre Stripe-objekter er kontekst.

## Hvad du skal gøre bagefter
- Tildele økonomiroller til kasserer og godkendere.
- Uploade bank-CSV (kontoudtog) og udlægsopgørelsen med kvitteringer.
- Godkende kategoriseringsregler, skæringspunkt og de to åbningskladder.
- Afklare moms og skat.
