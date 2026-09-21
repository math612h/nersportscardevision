# Fjernelse fra team-lineup skal forblive synligt korrekt

## Hvad skærmbilledet og data viser

- Daniel forsøgte bevidst at fjerne både Kenneth og sig selv fra LMGT3-lineupet; det var ikke et fejlklik.
- Databasen har gemt begge fjernelser med en slutdato. De er derfor ikke længere aktive i LMGT3-lineupet.
- Problemet er visningen efter genindlæsning: den får fjernede kørere til at se ud, som om de stadig er aktive.

## Ændringer

1. **Bevar begge fjernelser**
   - Daniel skal ikke sættes tilbage på LMGT3-lineupet.
   - Kenneths og Daniels historiske bidrag til allerede kørte afdelinger bevares.
   - Ingen af dem må tælle med i kommende afdelinger, medmindre de tilføjes igen.

2. **Vis kun aktive kørere i det aktive lineup**
   - Kørere med en slutdato fjernes helt fra den aktive liste efter både klik og genindlæsning.
   - De vises kun i den sammenklappede sektion “Tidligere lineup”.
   - Antallet af aktive/accepterede kørere og lineupets status beregnes kun ud fra aktive rækker.

3. **Sikker opdatering efter klik**
   - Fjern-knappen afventer den gemte ændring og genhenter lineupet fra databasen, så lokal, cachet visning ikke kan sætte personen tilbage på skærmen.
   - Ved fejl vises en tydelig besked, og personen flyttes ikke visuelt, før ændringen er gemt.

4. **Kontrol og udgivelse**
   - Kontrollér som teamejer, at begge navne forsvinder fra det aktive LMGT3-lineup og fortsat kun findes under historikken efter genindlæsning.
   - Kontrollér, at LMP2-lineupet og tidligere team-point er uændrede.
   - Udgiv rettelsen, så Daniel ser den nye visning på den offentlige side.

## Teknisk

- Ret kun præsentationen og genhentningen omkring `LeagueTeamSignupCard`; den eksisterende tidsbaserede pointlogik ændres ikke.
- Bevar de nuværende `effective_until`-værdier for Daniel og Kenneth.
- Verificér med typekontrol og en faktisk browsergenindlæsning på team-siden.
