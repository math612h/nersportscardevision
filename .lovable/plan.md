# Mathias Gylden mangler tiltrædelsespoint fra Silverstone

## Hvad jeg har fundet

- Mathias Gylden (LMGT3 Pro, bil #145) tilmeldte sig ICE Cup **14. september**, altså efter Afdeling 1 – Silverstone (2. september). Han har ingen resultatrække i Silverstone.
- Efter reglen skal han derfor have 8 tiltrædelsespoint i Silverstone — men der ligger kun én tiltrædelsesrække i afdelingen, nemlig Kenneth Dahl Pedersens.
- Årsagen: tiltrædelsespointene blev kun oprettet for Kenneth, fordi backfill'en dengang kørte for én enkelt kører. Den samlede kørsel for hele ligaen er ikke blevet udført, siden funktionen blev bygget. Nye tilmeldinger fra i dag og frem får dem automatisk.
- Interlagos (16. september) er korrekt uden tiltrædelsespoint til ham — han var allerede tilmeldt inden det løb.

## Hvad jeg vil gøre

1. Køre tiltrædelsespoint-beregningen for hele ICE Cup, så alle kørere der er tilmeldt efter en afholdt afdeling får deres manglende point. Beregningen er idempotent: den opretter kun det der mangler, rører ikke rigtige resultater, og fjerner ikke Kenneths eksisterende rækker.
2. Kontrollere bagefter hvilke kørere der fik point, og bekræfte at Mathias Gylden nu står med 8 point i Silverstone i LMGT3-stillingen.
3. Rydde op i en dobbelt tilmeldingsrække: Mathias Gylden står to gange i entrylisten (samme klasse, samme bilnummer, oprettet 14. og 15. september). Den nyeste dublet fjernes, så han kun optræder én gang — det påvirker ikke hans resultater.

## Teknisk

- Backfill via `ensureJoinerPoints(supabaseAdmin, '68f86ec5-…')` uden `userId`-filter (kald gennem et eksisterende admin-flow, f.eks. "Genberegne point" på liga-stillingssiden, som allerede kalder funktionen for hele ligaen).
- Ingen kodeændringer og ingen skemaændringer; kun data opdateres i `divisions.settings.results` + `league_results`.
- Dubletten i `entries` slettes med en målrettet delete på entry-id.
