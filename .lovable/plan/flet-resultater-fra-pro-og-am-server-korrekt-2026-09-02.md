# Flet resultater fra PRO- og AM-server korrekt

Ja, det giver mening. Efter du har flyttet kørere mellem PRO og AM, kan en klasse (fx LMGT3 Am) have kørere spredt over begge serverfiler. Så skal resultatet flettes efter omgange og tid — ikke efter den placering, filen selv angiver.

## Sådan er det i dag

Ved upload af resultater tages placeringen fra filen (klasseplacering) når den findes. Uploader du to filer, kommer der to "P1" ind i samme klasse, og rækkefølgen bliver forkert. Hurtigste omgang findes også kun inden for hver enkelt fil.

## Hvad der ændres

1. Hver importeret kører markeres med hvilken server (PRO/AM) resultatet kom fra.
2. Når en klasse indeholder kørere fra begge filer, ignoreres filens egne placeringer helt. Klassen sorteres i stedet efter:
   - flest gennemførte omgange
   - derefter hurtigste samlede løbstid (inkl. tidsstraffe)
   - kørere der udgik placeres efter de gennemførte, sorteret efter omgange
3. Klasser der kun findes i én fil fungerer præcis som i dag (filens placeringer bruges).
4. Hurtigste omgang beregnes på tværs af begge filer pr. klasse, så der kun kan være én pr. klasse — det fjerner også fejlen "Kun én hurtigste omgang pr. klasse" ved dobbelt-upload.
5. Kvalifikation flettes allerede efter omgangstid; her sikres blot at begge filer kan indlæses uden at overskrive hinanden.
6. I preview-tabellen vises et lille PRO/AM-mærke ud for hver kører, så du kan se hvor tiden kom fra, og at flettningen ser rigtig ud inden du gemmer.
7. 70%-reglen for point beregnes fortsat pr. klasse (klassens vinder-omgange), nu på det flettede felt.

## Teknisk

- `src/routes/_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx`: `DraftRow` får `source_server: "pro" | "am" | null`; `importXml` sætter feltet og akkumulerer hurtigste omgang på tværs af filer i stedet for pr. fil. Rangeringen i både `preview` og `save` slår `source_position` fra for klasser der har rækker fra mere end én server og bruger `sortByRaceData` (omgange, derefter effektiv tid).
- Ingen databaseændringer; kun upload-/preview-logik i admin.
