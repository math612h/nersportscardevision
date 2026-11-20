# Hent Stripe-saldo ved skæringspunkt

## Hvad du får
Under Regnskab → Rapporter → Afstemning kommer en ny knap: **Hent Stripe-saldo ved skæringspunkt**.

- Knappen bruger kun den godkendte skæringsdato fra regnskabsopsætningen (10. november 2026 kl. 00.00 dansk tid). Er skæringspunktet ikke godkendt, vises en fejl, og der hentes intet.
- Stripe laver rapporten via sin rapportfunktion. Det tager typisk 10–60 sekunder. Imens viser knappen "Henter rapport…".
- Når rapporten er klar, vises **slutsaldoen i DKK** pr. skæringspunktet, samt rapportens ID og tidspunkt.
- Knappen **Download original CSV** henter Stripes fil præcis som den er, så du kan vedhæfte den til Kladde A.
- Knappen henter kun rapporten. Den bogfører ikke, ændrer ikke kladder og vedhæfter intet automatisk.

## Tydelige fejl
- Nøglen mangler rapportadgang (Stripe svarer med en adgangsfejl): "Stripe Live-nøglen har ikke adgang til rapporter. Giv nøglen læseadgang til Reporting / Report runs."
- Stripe har endnu ikke data til og med skæringspunktet: der vises den seneste dato, Stripe har data for.
- Rapporten fejler hos Stripe: Stripes egen fejltekst vises.

## Teknisk
- Ny server-funktion i `src/lib/finance/stripe-report.functions.ts`. Den kræver login og en økonomirolle (`requireFin`) og bruger `createStripeClient("live")`.
- Skæringspunktet læses fra `fin_settings.cutoff_at` på serveren, og funktionen kræver `cutoff_approved_at`. Klienten sender ikke selv en dato.
- Flow: tjek `reporting.reportTypes.retrieve("balance.summary.1")`, så `data_available_end >= cutoff`. Opret derefter `reporting.reportRuns.create({ report_type: "balance.summary.1", parameters: { interval_start: data_available_start, interval_end: cutoff, currency: "dkk" } })`. Klienten poller en `getReportRun(id)`-funktion hvert 3. sekund, til den står som `succeeded` eller `failed`.
- CSV: filen hentes på serveren gennem forbindelsen, ud fra filens URL. Den returneres som tekst uændret og gemmes i browseren som en Blob med navnet `stripe-balance-summary-<cutoff>.csv`. Slutsaldoen findes i CSV'ens `ending_balance`-række og omregnes fra hele øre til kr.
- Fejl følger mønstret `{ error }` med `getStripeErrorMessage`. 401/403 og `permission`-fejl bliver til beskeden om manglende rapportadgang.
- Risiko: Stripe-filer ligger på `files.stripe.com`, som forbindelsen måske ikke videresender. Afvises det, viser knappen saldoen og en klar besked om, at CSV-download ikke er mulig gennem forbindelsen. Saldoen vises stadig. Det kontrolleres ved første kørsel.
- En lille test af CSV-parseren (slutsaldo i øre) og af afvisningen, når skæringspunktet ikke er godkendt.
