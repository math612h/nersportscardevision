# Automatisk "Vi er LIVE" på forsiden og i Discord

Når LMU Danmarks YouTube-kanal går live, skal siden selv opdage det og:

1. Vise en tydelig LIVE-bjælke øverst på forsiden med link til streamen.
2. Sende én besked i Discord-kanalen Broadcast (1549648346463871046) med ping til medlems-rollen.
3. Fjerne bjælken igen automatisk, når streamen slutter.

Kun YouTube overvåges (kanal UCJUbwNmuLUXybJlUzJZbPjg). Twitch er ikke med.

## Sådan virker det

Et automatisk job kører hvert 5. minut og tjekker kanalens live-side.

- Går kanalen fra "ikke live" til "live": status gemmes (video-ID, titel, starttidspunkt) og Discord-beskeden sendes én gang.
- Er den stadig live: intet nyt sker — ingen gentagne beskeder.
- Slutter streamen: status sættes til ikke-live, og bjælken forsvinder fra forsiden.

Discord-beskeden ser sådan ud:

```text
@Medlem

🔴 VI ER LIVE PÅ YOUTUBE!

📺 <stream-titel>
👉 https://www.youtube.com/watch?v=<video-id>

Kom ind og se med — vi ses i chatten! 🏁
```

Forsidebjælken viser "LIVE NU" med pulserende rød prik, stream-titlen og en knap "Se streamen", der åbner YouTube i ny fane. Den vises kun, når vi rent faktisk er live, og kun for de besøgende — den fylder ikke, når vi er offline.

I kontrolpanelet under Cron-jobs kommer der en knap "Tjek YouTube live", så man kan trigge tjekket manuelt, hvis noget hænger.

## Teknisk

**Database (migration)**
- Ny tabel `public.broadcast_live_state` med én række pr. platform: `platform` (unik, 'youtube'), `is_live`, `video_id`, `title`, `started_at`, `announced_at`, `discord_message_id`, `created_at`, `updated_at`.
- `GRANT SELECT` til `anon` + `authenticated`, `GRANT ALL` til `service_role`. RLS slået til med én offentlig læsepolitik; skrivning sker kun server-side med service role.
- `updated_at`-trigger som i øvrige tabeller.
- pg_cron-job hvert 5. minut, der kalder det nye endpoint (samme mønster som eksisterende cron-jobs).

**Detektion (nøglefri)**
- `src/lib/youtube-live.server.ts`: henter `https://www.youtube.com/channel/UCJUbwNmuLUXybJlUzJZbPjg/live` med en almindelig browser-User-Agent og udleder live-status fra sidens indlejrede data (`"isLive":true` / `isLiveBroadcast`), samt `videoId` og titel. Returnerer `{ isLive, videoId, title }`. Fejler hentningen, returneres "ukendt" og den gemte status lades urørt (ingen falske "offline").
- Kræver ingen YouTube API-nøgle og ingen kvote.

**Cron-endpoint**
- `src/routes/api/public/cron/youtube-live.ts` (POST): kalder detektoren, sammenligner med `broadcast_live_state` via `supabaseAdmin` (importeret inde i handleren), opdaterer rækken og poster til Discord kun ved overgangen offline → live.
- Discord-post via eksisterende `sendDiscordChannelMessage` fra `src/lib/discord.server.ts` til kanal `1549648346463871046`, med rolle-mention af medlems-rollen (`1542536891486965962`, samme som i `league-announce.functions.ts`) og `allowed_mentions.roles` sat, så pinget virker. Fejler Discord, gemmes status alligevel og fejlen logges — ikke fatalt.
- `discord_message_id` gemmes, så beskeden senere kan redigeres/ryddes op hvis ønsket.

**Forside**
- Ny offentlig server-funktion `getLiveStatus` i `src/lib/broadcast-live.functions.ts` (publishable-key klient, ingen auth) — sikker at kalde fra den offentlige loader.
- `src/routes/index.tsx` henter status via `useQuery` med 60 sek. refetch og renderer ny komponent `src/components/LiveNowBanner.tsx` øverst, kun når `is_live` er sand. Stylet med eksisterende design-tokens (rød accent), ingen hardcodede farver.

**Kontrolpanel**
- `"youtube-live"` tilføjes til `TRIGGERS` i `src/lib/cron.functions.ts` med label "Tjek YouTube live".
