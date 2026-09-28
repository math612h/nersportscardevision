# Stop utilsigtede hop til forsiden

## Hvad sker der
Sider bag login (kontrolpanel, profil, teams, protester m.m.) er beskyttet af to "vagter", der sender brugeren til forsiden, hvis de tror, man ikke har adgang eller ikke har udfyldt sin profil. Begge vagter kan tage fejl et kort øjeblik:

1. **Rolle-tjek:** Når login-sessionen fornyes i baggrunden (sker automatisk, fx når man skifter fane tilbage), hentes ens roller igen. Hvis det opslag fejler eller er langsomt, bliver man midlertidigt behandlet som "ikke admin" og sendt til forsiden.
2. **Profil-tjek:** Ved hver login-hændelse genindlæses alt data, inkl. tjekket af om profilen er udfyldt. Fejler opslaget, tolkes det som "profil ikke udfyldt", og man sendes til forsiden.

Diagnosen er baseret på koden; den er ikke genskabt live endnu.

## Rettelser
- Roller: behold de kendte roller, hvis genopslaget fejler, og vis "Indlæser…" i stedet for at omdirigere, mens roller hentes efter en sessionsændring.
- Reager kun fuldt (genindlæs alt data) når man faktisk logger ind/ud eller skifter bruger — ikke ved automatisk fornyelse af sessionen.
- Profil-tjek: omdiriger kun, når opslaget er lykkedes med et sikkert svar; ved fejl bliver man på siden.
- Gennemgå andre steder med samme mønster (sider der selv tjekker isAdmin/isSteward og sender til forsiden) og giv dem samme beskyttelse.

## Kontrol
- Log ind som admin, åbn kontrolpanelet, skift fane frem og tilbage, og tving en sessionsfornyelse — man skal blive på kontrolpanelet.
- Simulér at rolle-/profilopslag fejler — ingen omdirigering til forsiden.
- Almindelig bruger uden adgang sendes stadig væk fra kontrolpanelet; ufuldstændig profil sendes stadig til forsiden.

## Teknisk
- `src/hooks/use-auth.tsx`: i onAuthStateChange spring `router.invalidate()`/`qc.invalidateQueries()` over for `TOKEN_REFRESHED`/`INITIAL_SESSION`, og hvis bruger-id er uændret; tjek `error` fra user_roles og behold forrige state ved fejl; tilføj `rolesLoading`.
- `src/routes/_authenticated._admin.tsx`: redirect kun når `!loading && !rolesLoading`.
- `src/routes/_authenticated.tsx`: kast ved fejl i profil-queryen (så `status` bevarer sidste gode værdi), redirect kun når `status` er fra succesfuldt opslag.
- `rg` efter `navigate({ to: "/" })` kombineret med rolletjek i andre ruter og ret tilsvarende.
- Ingen database-ændringer.

# Practice sessions synlige for alle

Alle besøgende (også uden login) skal kunne se practice sessions under hver afdeling i kalenderen, inklusive lobbykode og adgangskode.

## Ændringer
- Kalenderen viser practice sessions for alle, ikke kun tilmeldte/admins/stewards.
- Databasen tillader alle at læse practice sessions (ny offentlig læseregel; de eksisterende regler bevares).
- Funktionen der udleverer lobbykode/adgangskode til practice sessions returnerer dem til alle. Lobbykoder til selve løbene forbliver kun for tilmeldte.

## Teknisk
- `src/routes/ligaer.$leagueId.index.tsx`: `PracticeSessionsList` vises uden `canSeePractice`-betingelsen (variablen bevares hvis brugt andre steder).
- Migration: `CREATE POLICY "Anyone can read practice sessions" ON division_practice_sessions FOR SELECT TO anon, authenticated USING (true)` + `GRANT SELECT ... TO anon`; `get_division_practice_credentials` og `get_practice_session_credentials` fjerner deltager-tjekket og får `GRANT EXECUTE ... TO anon`.
- `get_division_lobby` (løbs-lobby) røres ikke.
