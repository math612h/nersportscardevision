# Fix: kan ikke tilføje Kenneth til LMP2-lineupet

## Årsag (bekræftet)
Databasen har en regel om, at en kører kun må stå på ét aktivt lineup pr. liga. Reglen tæller dog også kørere, der er fjernet fra et lineup (de gemmes stadig af hensyn til tidligere point). Kenneths gamle, fjernede LMGT3-række tæller derfor stadig som "aktiv", og tilføjelsen til LMP2 afvises.

## Rettelse
- Reglen ændres, så den kun gælder kørere, der faktisk står på et lineup lige nu (ikke fjernede).
- Fjernede kørere beholder deres historik og point fra tidligere afdelinger.
- Fejlbeskeden vises på dansk, hvis en kører faktisk står aktivt på et andet lineup ("Køreren står allerede på et andet lineup i ligaen").

## Tekniske detaljer
Migration: drop og genopret `league_team_lineup_active_user_per_league_uniq` på `(league_id, user_id)` med `WHERE status IN ('invited','accepted') AND effective_until IS NULL`. Map fejlkode 23505 for dette index til dansk tekst i `submitTeamForLeague`. Verificér ved at tilføje Kenneth til Odyssés LMP2-lineup.
