# Ret Fuji (Afd. 4) – Pro-placeringer forskudt efter Jens

## Hvad der er galt
I Fuji-resultatet på Pro-serveren står kørerne efter Jens én plads for lavt:

| Kører | Plads i resultatfilen | Står nu | Skal stå |
|---|---|---|---|
| Jens Rasmussen | 11 | P11 · 18p | P11 · 18p |
| Marco Høgh | 12 | P11 · 18p | P12 · 17p |
| Kenneth Nielsen | 13 | P12 · 17p | P13 · 16p |
| Per Arildsoe | 14 | P13 · 16p | P14 · 15p |

Årsag: da Jens fejlagtigt stod som DNS, blev Pro-pladserne nummereret om uden ham (Marco rykkede op til 11 osv.). Da Jens blev sat tilbage som P11, blev de andre ikke rykket ned igen. Am-serveren er ikke påvirket.

## Rettelse
1. **Data:** Sæt Marco til P12/17p, Kenneth Nielsen til P13/16p og Per Arildsoe til P14/15p på Fuji (point efter ligaens pointtabel). Jens beholder P11/18p.
2. **Kode:** Når stillingseditoren gemmer, nummereres klassepladserne altid om ud fra plads i resultatfilen pr. server (Pro/Am), så to kørere aldrig kan få samme plads, og en kører der sættes tilbage automatisk skubber de andre ned.
3. **Tjek:** Gennemgå alle afdelinger i ICE Cup for dobbelte placeringer i samme klasse og server, og ret dem på samme måde hvis der findes flere.

Fuji er stadig ikke bekræftet, så ingen DNS-udmeldelser påvirkes. Discord-stillingerne skal opdateres med knappen bagefter.
