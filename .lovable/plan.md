# Overhaling af ligasiden

## Resultat
Ligasiden bliver en kort, overskuelig forside med fem tydelige genveje. De nuværende lange visninger flyttes til selvstændige sider uden at fjerne deres indhold eller funktioner.

## Ligaens forside
Forsiden viser kun:
- ligaens beskrivelse
- antal aktive tilmeldte i hver klasse/kategori, inklusive kapacitet hvor den findes
- nedtælling til næste ikke-afsluttede afdeling, i samme stil som forsiden
- den tilmeldte kørers aktuelle samlede placering i egen klasse/mesterskab
- de nuværende knapper til tilmelding, redigering, udmelding og regler
- genveje til Entryliste, Teams, Kalender, Præmier og Stillinger

Hvis brugeren ikke er tilmeldt, vises ingen personlig placering. Hvis der endnu ikke findes offentliggjorte resultater, vises det tydeligt i placeringsfeltet.

## Nye sider
- **Entryliste:** den nuværende deltageroversigt med klasser, kategorier, venteliste og køreroplysninger.
- **Teams:** den nuværende teamoversigt og teamtilmelding. Genvejen vises kun for ligaer, hvor teams er aktiveret.
- **Kalender:** alle afdelingskort, nedtællinger, serveroplysninger og træningssessioner. Den nuværende Driver Aids-visning flyttes hertil.
- **Præmier:** den nuværende præmievisning. Genvejen vises kun, når ligaen har præmier.
- **Stillinger:** kun den samlede kører- og teamstilling opdelt efter klasse/kategori. Individuelle stillinger pr. afdeling fjernes; afdelingssiderne beholder deres enkelte løbsresultater.

Alle undersider får en ensartet ligatitel og en tydelig vej tilbage til ligaens forside.

## Navigation
Genvejene bliver rigtige links med egne adresser under ligaen, så hver visning kan åbnes, genindlæses og deles direkte. Den nuværende vandrette springmenu og de lange sektioner fjernes fra forsiden.

## Tekniske detaljer
- Opret fem nye ligaundersider og genbrug de eksisterende visninger og forespørgsler frem for at kopiere deres logik.
- Saml fælles ligaindlæsning, titel og navigation, så siderne viser samme data og adgangsregler.
- Beregn den personlige placering fra de samme offentliggjorte, afsluttede resultater som den samlede stilling, matchet på bruger, klasse og kategori.
- Bevar nuværende håndtering af udmeldte kørere, statusmærker, pointstraffe, team-lineups, serveradgang og tilmeldingsregler.
- Giv hver ny side sin egen titel og beskrivelse til deling og søgning.
- Kontrollér links, tomme tilstande, tilmeldt/ikke-tilmeldt visning samt mobil og desktop.
