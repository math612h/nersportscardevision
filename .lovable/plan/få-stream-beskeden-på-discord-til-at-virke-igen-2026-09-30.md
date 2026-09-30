# Få stream-beskeden på Discord til at virke igen

## Hvad der gik galt
- Jobbet kører faktisk hvert 5. minut. Listen over seneste kørsler blandes med andre job, der kører hvert minut, så det ser ud som om det kører sjældnere.
- "succeeded" betyder kun, at jobbet fik sendt sin forespørgsel afsted. Det betyder ikke, at tjekket lykkedes.
- Siden kl. 06:45 dansk tid har YouTube afvist hjemmesidens tjek med "for mange forespørgsler" (fejlkode 429). Hver kørsel er derfor sprunget over, også den kl. 11:00. Beskeden skulle være sendt kl. 09:50, men gik aldrig ud.
- Årsagen er, at vi læser YouTubes almindelige webside. Den blokerer servere, der henter den tit.
- Beskeden for Imola er nu sendt manuelt.

## Løsning
1. Skift til YouTubes officielle, gratis adgang til kanaldata i stedet for at læse websiden. Den bliver ikke blokeret på samme måde.
   - Kanalens offentlige videofeed giver de nyeste video-id'er. Det kræver ingen nøgle.
   - YouTubes officielle opslag giver status for de videoer: live, planlagt med starttid eller slut. Det koster 1 enhed pr. opslag ud af 10.000 gratis pr. dag.
2. Det gamle websidetjek beholdes som reserve.
3. Hvis tjekket fejler flere gange i træk, og en stream er planlagt inden for 10 timer, bliver fejlen logget tydeligt. "Tjek YouTube live" i kontrolpanelet viser også den rigtige fejl.

## Det skal du gøre
- Opret en gratis YouTube Data API-nøgle i Google Cloud Console, og indsæt den, når jeg beder om den. Jeg guider dig igennem det.

## Teknisk
- Ny hemmelig nøgle `YOUTUBE_API_KEY`.
- `youtube-live.server.ts`: primær kilde er RSS (`feeds/videos.xml?channel_id=...`) plus `videos.list?part=snippet,liveStreamingDetails`. Status udledes af `snippet.liveBroadcastContent` og `scheduledStartTime` / `actualEndTime`. Fallback til den nuværende HTML-parsing. Seneste afsluttede stream hentes samme sted.
- Cron-endpointet er uændret ud over den nye kilde. Returnér fejlårsagen i svaret.

## Alternativ: tjek én gang i timen (ingen nøgle nødvendig)
- Vi henter YouTube-siden 12 gange sjældnere, så risikoen for at blive blokeret falder meget. Men YouTube kan stadig blokere, fordi hjemmesiden deler servere med mange andre sider. Det er altså ikke sikkert.
- Beskeden bliver sendt 9-10 timer før start i stedet for præcis 10 timer før. Det er fint.
- Ulempen: "LIVE NU"-visningen på forsiden kan komme op til 1 time for sent, og det samme gælder, når den forsvinder igen. For at undgå det tjekker vi hvert 5. minut i den sidste time før en planlagt start og mens streamen kører. Resten af tiden tjekker vi én gang i timen.
- Kan kombineres med den officielle løsning ovenfor senere, hvis blokeringen fortsætter.
