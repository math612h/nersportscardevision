# Forsiden viser kun det linkede stream

## Årsag
Forsiden tjekker selv YouTube-kanalen for live-udsendelser. I aften fandt den en anden video ("Kan du lide denne video?") og viste den som live i stedet for Bahrain-streamet, du havde linket i kontrolpanelet.

## Ændring
- Når et stream-link er sat i kontrolpanelet ("Stream link"), viser forsiden **altid kun den video** — både før, under og efter udsendelsen. Automatisk fundne videoer ignoreres.
- Er det linkede stream live, vises det som live-afspiller (med "LIVE"-mærke); ellers vises thumbnail med afspil-knap som nu.
- Kun hvis der ikke er sat noget link, bruges den automatiske visning som i dag.

## Teknisk
- `src/components/LivestreamSection.tsx`: hvis `manualEnabled && manualVideoId`, brug altid manual video; "live"-visning kun når `status.videoId === manualVideoId`.
- `src/routes/index.tsx`: vis live-sektion kun når den live video er den linkede (når link er sat), ellers "last"-sektion med det linkede stream.
- Discord-annoncering af live påvirkes ikke.
