# Forside: liga-knap, livestream og oprydning

## Hvad ændres

**1. Liga-knappen følger den aktive liga**
- Knappen "Ligaer" på forsiden hedder nu ligaens navn (fx "LMU Danmark ICE Cup") og går direkte til ligasiden.
- Aktiv liga = den offentlige liga, der ikke er sat til offseason (i dag: ICE Cup). Når ICE Cup afsluttes/sættes til offseason, og en ny liga offentliggøres, skifter knappen automatisk.
- Ingen aktiv liga → knappen skjules.
- Samme regel for "Ligaer" i topmenuen og i mobilmenuen i bunden. Leaderboard bliver stående i topmenuen som nu.

**2. Liga-oversigtssiden fjernes**
- Siden med alle ligaer fjernes. Gamle links til den (fx fra beskeder, tilbage-knapper og Google) sendes automatisk videre til den aktive liga — eller forsiden, hvis der ingen er.
- Tilbage-knapper på ligasiden og leaderboard, der pegede derhen, peger på forsiden i stedet.

**3. "Tidligere løb" nederst fjernes**
- Listen over ældre løb nederst på forsiden fjernes. Kortet "Seneste løb" med resultater bliver.

**4. Ugens Overhaling kun på Discord**
- Vinderklippet vises ikke længere på forsiden. Discord-opslaget fortsætter uændret. Konkurrencesiden selv bevares (menupunktet i "Mere" bliver).

**5. YouTube-livestream på forsiden**
- Normalt: en sektion "Seneste livestream" med den seneste afsluttede stream, som kan genses direkte på forsiden.
- Når vi går live: "Seneste løb" erstattes af den indlejrede livestream øverst (med LIVE-mærke).
- Når streamen slutter: "Seneste løb" kommer tilbage, og den netop afsluttede stream bliver den nye "Seneste livestream".
- Den eksisterende LIVE-bjælke øverst fjernes, da streamen nu vises direkte.

## Teknisk
- `src/lib/active-league.functions.ts`: offentlig `getActiveLeague` (publishable-klient) → nyeste `leagues` med `published = true AND is_offseason = false`, returnerer `{id, name} | null`. Hook `useActiveLeague` (react-query) bruges i `index.tsx`, `AppHeader.tsx`, `MobileBottomNav.tsx`.
- `src/routes/lmu.liga.tsx` erstattes af en ren redirect (`beforeLoad` → `/ligaer/$leagueId` eller `/`); fjernes fra `sitemap[.]xml.ts`. `ligaer.$leagueId.index.tsx`/`leaderboard.tsx` tilbage-links → `/`. `admin-messages.functions.ts` link → `/`.
- `index.tsx`: fjern `OvertakingWinnerSection`-rendering og "Tidligere løb"-sektionen (ca. L470–530); fjern `<LiveNowBanner />`.
- Migration: tilføj `last_video_id`, `last_title`, `last_ended_at` til `broadcast_live_state` (ingen nye tabeller; eksisterende grants/RLS dækker).
- Cron `api/public/cron/youtube-live.ts`: ved overgang live → offline gemmes den afsluttede stream i `last_*`. Første gang (tomt `last_video_id`) hentes seneste stream fra kanalens `/streams`-side i `youtube-live.server.ts` (ny `fetchLatestYoutubeStream`).
- `getLiveStatus` udvides med `lastVideoId/lastTitle`. Ny komponent `LivestreamSection` (iframe `youtube.com/embed/<id>`): hvis live → rendres i stedet for "Seneste løb"; ellers "Seneste løb" + "Seneste livestream" under den. Refetch hvert 60. sek.
