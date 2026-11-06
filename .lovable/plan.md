# Træningsdag på forsiden

## Hvad brugeren ser
- På dage med træningssessioner vises en "Træningsdag"-sektion øverst på forsiden i samme stil som Race Day-sektionen (stor nedtælling, bane, liga, lobby-info for godkendte kørere).
- Ingen Drivers Briefing-knap.
- Har dagen flere sessioner (fx tre om søndagen), vises de samlet i én sektion: én kort pr. session med tidspunkt, server, varighed (træning/quali/løb) og egen nedtælling. Sessioner der er slut, nedtones; den næste fremhæves.
- Sektionen vises fra 12 timer før dagens første session og indtil 1 time efter den sidste er slut.
- Er der både løb og træning samme dag, vises Race Day først og træningen under.

## Teknisk
- I `src/routes/index.tsx`: ny `PracticeDaySection` + query der henter `practice_sessions` (med division/liga/bane) i vinduet nu-12t til nu+12t, grupperet efter kalenderdag (København) for den nærmeste dag.
- Lobbykode/adgangskode hentes via den eksisterende tidsbegrænsede `get_division_practice_credentials`, kun for godkendte brugere — ligesom i `PracticeSessionsList`.
- Slut-tid = starts_at + practice/quali/race-minutter.
- Genbruger Race Day-styling (stribe, glød, nedtælling).
