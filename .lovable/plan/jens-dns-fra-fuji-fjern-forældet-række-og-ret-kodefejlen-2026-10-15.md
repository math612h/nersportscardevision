# Jens' DNS fra Fuji — fjern forældet række og ret kodefejlen

## Hvad der er sket (bekræftet i databasen)

- Jens kørte faktisk Fuji-løbet og sluttede **P11 med 18 point** — det står korrekt i resultatdataene (genberegnet kl. 01:21 i nat).
- Men afdelingens gemte resultatspejl indeholder **to rækker for Jens**: den rigtige P11-række og en gammel DNS-række. DNS-rækken stammer fra genberegningen kl. 21:16, hvor Jens var udmeldt — da han meldte sig til igen kl. 21:18, og der blev genberegnet igen, kom den rigtige række med, **uden at den gamle DNS-række blev fjernet**.
- Det er den ekstra DNS-række, der vises på siden og tæller med i hans udeblivelser.

## Konsekvens for Jens' udmeldelse

Med de korrekte data har Jens kun **2 udeblivelser** (Interlagos og Imola) — under grænsen på 3. Beslutningen i går om at melde ham ud igen byggede på fejldata (han stod som DNS på Fuji, fordi han var udmeldt, da filen blev uploadet). Han har selv meldt sig til igen kl. 21:18, og **den tilmelding lader vi stå** — det svarer til, hvad reglerne siger med de rigtige tal.

De tre andre udmeldte er verificeret: Ronni Simonsen, Lukas Weiss og Martin Sørensen missede reelt Interlagos, Imola **og** Fuji — deres udmeldelser står ved magt.

## Tjek for lignende fejl (allerede udført)

- Gennemgået **alle ligaer og afdelinger**: ingen andre kørere har dobbeltrækker i samme klasse, og ingen DNS-rækker har kørte omgange eller point bag sig. Fejlen findes kun hos Jens.
- Kenneth Dahl Pedersens dobbeltrækker er **ikke** fejl — han kører både LMGT3 og LMP2 og får tiltrædelsespoint i den klasse, han ikke kørte. Det er som designet.

## Plan

1. **Fjern den forældede DNS-række** for Jens fra Fuji-afdelingens gemte resultater. P11-rækken med 18 point bevares — point og placeringer ændres ikke.
2. **Lad Jens' nuværende tilmelding stå** (han er allerede aktiv igen), og send ham en kort besked på siden og Discord: fejlen er rettet, han er med i ligaen, og han har 2 udeblivelser.
3. **Ret kodefejlen**, så det ikke kan ske igen: når resultater genberegnes eller uploades, skal en kørers gamle DNS-række fjernes, hvis vedkommende nu har et rigtigt resultat — der må højst være én række pr. kører pr. klasse pr. afdeling.
4. **Automatisk udmeldelse først efter bekræftede resultater** (jeres nye ønske): i dag kører DNS-grænsen med det samme ved upload — inden I har nået at kontrollere filen. Det ændres, så udeblivelser kun tælles fra afdelinger, hvor I har trykket "Bekræft resultater" i kontrolpanelet. Når I bekræfter en afdeling, kører kontrollen automatisk på de bekræftede data. Ubekræftede uploads kan altså aldrig udløse en udmeldelse.
5. **Kontrol bagefter**: Jens vises kun som P11 på Fuji-siden, hans udeblivelser tæller 2, og stillingerne er i øvrigt uændrede.

## Teknisk

- Datafix: fjern rækken med `status='dns'` for `user_id=ffd17363-e47b-471d-a22a-bb0520dcf036` fra `divisions.settings.results` på afdeling `1389adee-e321-4ceb-ab22-2c79e67f1972` (Fuji). `league_results` er allerede korrekt (én klassificeret række, P11, 18 point) og røres ikke.
- Kodefix i `src/lib/league-results.functions.ts`: ved genopbygning af spejlet deduplikeres pr. `user_id`+`car_class`, så en klassificeret række altid erstatter en tidligere DNS-række (og en kører uden resultat kun får én DNS-række).
- DNS-grænsen i `src/lib/dns-limit.server.ts` tæller kun rækker fra afdelinger med `settings.results_confirmed = true` (flaget findes allerede og sættes i dag ved "Bekræft resultater"). De automatiske kald efter upload/genberegning i `league-results.functions.ts` fjernes; til gengæld kaldes `enforceDnsLimit` fra `setResultsConfirmed`, når en admin bekræfter en afdeling. Den manuelle "kør DNS-kontrol"-funktion (`enforceLeagueDnsLimit`) består og rammer ligeledes kun bekræftede afdelinger.
- Besked til Jens sendes via den eksisterende `sendAdminDirectMessage`-funktion (notifikation + Discord-DM).
- Ingen databasemigrering nødvendig. Ændringsloggen røres ikke.
