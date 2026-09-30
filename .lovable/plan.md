# Sikre at stream-beskeden altid kommer ud

## Hvad skete der
- Imola-streamen starter kl. 19:50 dansk tid, så beskeden skulle være sendt kl. ca. 09:50 (10 timer før).
- Det automatiske tjek, der kører hvert 5. minut, kørte sidst kl. 06:40 dansk tid. Efter det er det ikke kommet igennem, så beskeden blev aldrig sendt.
- Sandsynligvis hænger det sammen med, at databasen blev sat på pause på grund af credits. Den årsag er ikke bekræftet.
- Jeg har kørt tjekket manuelt nu, og beskeden er **sendt til Discord** (Broadcast-kanalen med ping til medlemmer).

## Forslag, så det ikke sker igen
1. Tjek i kontrolpanelet under Cron-jobs, at jobbet "youtube-live-check" er aktivt, og at det rammer den rigtige adresse. Opret det igen, hvis det mangler.
2. Vis "sidst kørt" og "sidste resultat" for YouTube-tjekket i kontrolpanelet, så man kan se, hvis det er gået i stå.
3. Beskeden sendes også, hvis tjekket først kommer i gang senere end 10 timer før start. Det virker allerede i dag, så længe streamen ikke er startet endnu.

## Teknisk
- Kontrollér pg_cron-jobbet `youtube-live-check`, og genopret det om nødvendigt mod den stabile produktions-URL `/api/public/cron/youtube-live`.
- Vis `broadcast_live_state.updated_at` samt announce-felterne på siden `admin/cron`.
