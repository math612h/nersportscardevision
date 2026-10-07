# Kenneth står med 69 point i både LMP2 og LMGT3 Pro på overlayet

## Hvad der er tjekket
- Hjemmesidens data er korrekte: Kenneth har **43 point i LMGT3** og **26 point i LMP2**. Tilsammen er det præcis **69**.
- Feedet, som den offentlige side sender til overlayet, viser nu kun Kenneth som LMP2 #6. Ingen af hjemmesidens overlay-feeds sender point med.

## Konklusion
Overlayet regner selv pointene ud, og det lægger alle Kenneths point sammen uanset klasse. Den summen vises så i begge klasser. Fejlen ligger altså i **streaming-projektet (overlayet)**, ikke i dette projekt.

## Det skal rettes i det andet projekt
- Når point lægges sammen pr. kører, skal de grupperes efter **kører + klasse** (og kategori Pro/Am), ikke kun efter kører.
- En kører skal kun stå i en klasse, hvis han har resultater i den klasse.

Ingen ændringer i dette projekt.
