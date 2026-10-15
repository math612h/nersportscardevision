# "Stream link"-side i kontrolpanelet + Stillinger-knap på forsiden

## 1. Ny admin-side: "Stream link"

Ny side i kontrolpanelet under "Broadcast": **Stream link** (`/admin/stream-link`).

- Et felt til at indsætte et YouTube-link (hele URL'en — siden udleder selv video-ID'et fra `watch?v=`, `youtu.be/` eller `/live/`-links).
- Valgfri titel (bruges som overskrift under afspilleren; ellers hentes titlen ikke — feltet kan bare stå tomt).
- En tænd/sluk-knap: **Vis på forsiden**.
- Knapper: Gem, samt "Fjern link" der slår visningen fra og rydder feltet.
- Siden viser det aktuelt gemte link, så man kan se hvad der ligger lige nu.

## 2. Forsiden bruger det manuelle link

- Når et stream-link er gemt og slået til, vises det i stedet for den automatiske "Seneste livestream" — som en **indlejret afspiller direkte på forsiden** (uden autoplay), med titel og et link der åbner streamen på YouTube.
- Når vi rent faktisk er LIVE (den automatiske live-detektion), vinder live-visningen stadig, som den gør i dag.
- Er der ikke gemt noget link (eller det er slået fra), opfører forsiden sig som nu.

Den automatiske "seneste stream"-detektion, der ikke virker efter hensigten, bliver dermed reelt erstattet af det manuelle link — I styrer selv hvad der vises.

## 3. "Stillinger"-knap på forsiden

- Ny knap ved siden af liga-knappen øverst på forsiden: **Stillinger**, der linker direkte til den aktive ligas stillingsside (`/ligaer/<id>/stillinger`).
- Den følger automatisk samme aktive liga som liga-knappen — når en ny liga bliver aktiv, peger begge knapper på den nye liga. Ingen aktiv liga → begge knapper skjules.

## Teknisk

- **Migration**: tre nye kolonner på `broadcast_live_state`: `manual_video_id` (text, nullable), `manual_title` (text, nullable), `manual_enabled` (boolean, default false). Eksisterende RLS/grants dækker (offentlig læsning, skrivning kun server-side).
- `src/lib/broadcast-live.functions.ts`: `getLiveStatus` udvides med `manualVideoId`, `manualTitle`, `manualEnabled`. Ny admin-beskyttet funktion `setManualStreamLink` (requireSupabaseAuth + assertAdmin-mønster som i fx `league-announce.functions.ts`) der parser video-ID fra URL og opdaterer rækken. Validering: afvis links hvor der ikke kan udledes et gyldigt 11-tegns video-ID.
- `src/components/LivestreamSection.tsx`: mode "last" bruger det manuelle link når `manualEnabled` og `manualVideoId` er sat (ellers som i dag); manuel visning bruger indlejret iframe (som live, men uden autoplay og uden LIVE-mærke) med overskriften "Livestream" og et eksternt link til YouTube.
- Ny route `src/routes/_authenticated._admin.admin.stream-link.tsx` med head-metadata, bygget med eksisterende Card/Input/Button/Switch-komponenter; menupunkt "Stream link" (Link2-ikon) tilføjes under "Broadcast" i `src/components/AdminSidebar.tsx`.
- `src/routes/index.tsx`: "Stillinger"-knap (variant outline, Trophy-ikon) ved siden af liga-knappen, kun når `activeLeague` findes.
- Typer regenereres via migrationen, så de nye kolonner er typesikre.
