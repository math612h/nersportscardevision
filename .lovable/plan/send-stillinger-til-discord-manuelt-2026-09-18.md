# Send stillinger til Discord manuelt

I dag findes der ingen funktion der sender stillinger til Discord — kun kalender, velkomst, hosted session m.m. Den bygges nu.

## Hvad du får

1. **Kanal-ID på ligaen**
   Et nyt felt "Discord kanal-ID til stillinger" i liga-oprettelsen/redigeringen, ved siden af det eksisterende incident-kanalfelt. Gemmes på ligaen, så du kun skal indtaste det én gang.

2. **Knap i kontrolpanelet**
   På stillingssiden i kontrolpanelet kommer en knap "Opdater stillinger på Discord". Den sender den aktuelle samlede mesterskabsstilling til den kanal ligaen har gemt. Mangler kanal-ID, får du en tydelig fejlbesked. Knappen kræver admin.

3. **Sådan ser beskeden ud**
   - Kun **navn og samlede point** — ingen afdelingskolonner, ingen team-kolonne.
   - Ét embed pr. klasse-kategori, tydeligt adskilt: **LMP2**, **LMGT3 Pro**, **LMGT3 Am** (præcis de kategorier ligaen bruger).
   - Derefter **holdstillinger**, tydeligt adskilt i egne embeds: **Teams — LMGT3** og **Teams — LMP2**.
   - Hver linje: placering, navn, point (fx `1. Jan Larsen — 47`). Udmeldte kørere markeres som i dag.
   - Øverst titlen med liganavn og tidsstempel for hvornår stillingen er opdateret.

## Teknisk

- **Migration:** ny kolonne `leagues.standings_channel_id text` (nullable). Ingen ændring af eksisterende data eller pointlogik.
- **LeagueFormWizard.tsx:** nyt input-felt, valideret som ciffer-streng (5–25 tal) ligesom de øvrige kanal-ID-felter, gemmes i liga-payloaden.
- **Ny fil `src/lib/discord-standings.functions.ts`:** `postLeagueStandingsToDiscord({ leagueId })`, `createServerFn` + `requireSupabaseAuth`, admin-tjek som i `discord-offseason-calendar.functions.ts`.
- **Ny fil `src/lib/discord-standings.server.ts`:** bygger stillingen server-side ud fra `league_results` (samme regler som stillingssiden: point pr. række minus strafpoint, joiner-rækker tæller med, DSQ håndteres) grupperet på `user_id + car_class + driver_category`, samt holdstilling via `league_team_entries`/`league_team_lineup` og `computeTeamRacePoints` fra `src/lib/team-points.ts` med respekt for `effective_from`/`effective_until`. Ingen eksisterende beregningslogik ændres — de samme hjælpefunktioner genbruges.
- Afsendelse via `sendDiscordChannelRichMessage` fra `src/lib/discord.server.ts`, `allowed_mentions: { parse: [] }`. Embed-beskrivelser splittes hvis en klasse overstiger Discord-grænsen på 4096 tegn; maks. 10 embeds pr. besked, ellers sendes flere beskeder.
- **Stillingssiden i kontrolpanelet** (`_authenticated._admin.admin.ligaer.$leagueId.stillinger.tsx`): knap med bekræftelses-dialog, loading-state og toast for succes/fejl.
