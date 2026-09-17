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
- fem tydelige genvejskort til Entryliste, Teams, Kalender, Præmier og Stillinger; hvert kort får ikon, titel og en kort forklaring

Hvis brugeren ikke er tilmeldt, vises ingen personlig placering. Hvis der endnu ikke findes offentliggjorte resultater, vises det tydeligt i placeringsfeltet.

## Nye sider
- **Entryliste:** den komplette nuværende deltageroversigt med venteliste og køreroplysninger, fortsat opdelt i LMP2, LMGT3 Pro og LMGT3 Am.
- **Teams:** den nuværende teamoversigt og teamtilmelding. Genvejen vises kun for ligaer, hvor teams er aktiveret.
- **Kalender:** alle afdelingskort, nedtællinger og serveroplysninger. Practice sessions forbliver under den relevante afdeling og samles ikke separat. Næste afdeling fremhæves tydeligt. Den nuværende Driver Aids-visning flyttes hertil.
- **Præmier:** alle nuværende præmier og kategorier bevares. Genvejen vises kun, når ligaen har præmier.
- **Stillinger:** både den samlede kører- og teamstilling bevares, opdelt efter klasse/kategori. Individuelle mesterskabsstillinger pr. afdeling fjernes; afdelingssiderne beholder deres enkelte løbsresultater og øvrige eksisterende funktioner.

Alle undersider får en ensartet ligatitel og tydelig tilbage-navigation til ligaens overblik. Navigationen skal være let tilgængelig på både mobil og desktop.

## Navigation
Genvejene bliver rigtige links med egne adresser under ligaen, så hver visning kan åbnes, genindlæses og deles direkte. Den nuværende vandrette springmenu og de lange sektioner fjernes fra forsiden.

## Tekniske detaljer
- Opret fem nye ligaundersider og flyt/genbrug de eksisterende visninger uden at ændre databasen, administratorfunktionerne eller den eksisterende datalogik.
- Saml fælles ligaindlæsning, titel og navigation, så siderne viser samme data og adgangsregler.
- Beregn den personlige placering fra de samme offentliggjorte, afsluttede resultater som den samlede stilling, matchet på bruger, klasse og kategori.
- Bevar alle eksisterende funktioner og data, herunder udmeldte kørere, statusmærker, pointstraffe, team-lineups, serveradgang, tilmeldingsregler, practice sessions, præmiekategorier og administratorfunktioner.
- Giv hver ny side sin egen titel og beskrivelse til deling og søgning.
- Bevar ligaens nuværende visuelle identitet, farver og stil; ændringen begrænses til informationsarkitektur og overskuelighed.
- Kontrollér alle eksisterende handlinger, links, data, tomme tilstande, tilmeldt/ikke-tilmeldt visning samt mobil og desktop for regressioner.
