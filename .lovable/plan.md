# Liga- og klassefilter på leaderboardet

## Hvad der bygges

To nye filtre på leaderboard-siden, der arbejder sammen med de eksisterende filtre (bilklasse, bane/layout):

1. **Liga-filter** — en dropdown med alle offentliggjorte ligaer (fx "LMU Danmark ICE Cup"). Når en liga vælges, vises kun tider fra kørere, der er tilmeldt den liga. Nye ligaer dukker automatisk op i filteret, når de oprettes og offentliggøres — ingen manuel vedligeholdelse.

2. **Klasse-filter i den valgte liga** — når en liga er valgt, erstattes den nuværende bilklasse-dropdown med klasserne fra netop den liga (fx "LMP2", "LMGT3 Pro", "LMGT3 Am" for ICE Cup). Vælges fx "LMGT3 Pro", vises **kun tider fra de kørere, der er tilmeldt LMGT3 Pro i den liga** — ikke bare alle LMGT3-tider. Klasserne kommer automatisk fra ligaens opsætning, så en ny liga med andre klasser får sine egne klassevalg.

## Regler for filtreringen

- En kører tæller som "tilmeldt", når tilmeldingen er aktiv (ikke udmeldt, ikke på venteliste).
- Kørere uden brugerkonto på siden kan ikke matches til en tilmelding og vises derfor ikke, når et liga-filter er aktivt.
- Pro/Am-opdeling følger tilmeldingen: en kører tilmeldt LMGT3 Am vises ikke under LMGT3 Pro, selv om begge kører LMGT3-biler.
- Uden valgt liga fungerer leaderboardet præcis som i dag.

## Teknisk gennemføring

- Fil: `src/routes/leaderboard.tsx` (kun frontend — ingen database- eller rettighedsændringer).
- Hent offentliggjorte ligaer (`leagues`: navn + `class_configs`) og aktive tilmeldinger (`entries`: bruger, liga, klasse, kategori) med to nye forespørgsler. Begge tabeller er allerede offentligt læsbare, så der skal ikke laves nye server-funktioner eller migrationer.
- Nyt state: `leagueId` og `leagueClass` (klasse + kategori). Filtreringen sker i det eksisterende `filtered`-beregning: ved valgt liga begrænses til tilmeldte bruger-id'er; ved valgt klasse begrænses yderligere til bruger-id'er tilmeldt netop den klasse/kategori, og tidens bilklasse skal matche klassen.
- Bilklasse-dropdownen viser ligaens klasser (med Pro/Am), når en liga er valgt; ellers vises alle klasser som nu.
- Verificer med typecheck/build og en visuel test i previewet (vælg ICE Cup → LMGT3 Pro og kontrollér, at kun tilmeldte kørere vises).
