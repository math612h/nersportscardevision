# DNF/DNS/RET i stillingerne, forklaring og automatisk udmelding ved DNS-grænsen

## Hvorfor der står "–" i dag (verificeret)

De gemte resultater har stort set alle en korrekt status (DNS, DNF, RET). "–" vises kun i to tilfælde:
1. **Køreren findes slet ikke i afdelingens resultater** — fx stod på venteliste, kom til senere, eller blev ikke taget med ved upload. Så er der intet at vise.
2. **Tiltrædelsespoint** — kørere der tilmeldte sig efter afdelingen (fx Kenneth og Mathias i Silverstone) får bevidst "–" med point i baggrunden.

## Hvad der ændres

1. **Ingen tomme felter for tilmeldte kørere**
   - Var køreren tilmeldt griddet til afdelingen, men står ikke i resultatet, vises **DNS** (samme mærkat som ellers).
   - Tiltrædelsespoint får sit eget lille mærkat **"TP"** i stedet for "–", så det er tydeligt hvorfor der er point.
   - "–" bruges kun, hvis køreren ikke var med i ligaen på det tidspunkt.

2. **Forklaring over stillingstabellerne** (ligaens stillingsside og afdelingssiden)
   En lille række med de samme farvede mærkater som i tabellen:
   - **DNF** (rød): Did Not Finish
   - **DNS** (grå): Did Not Show
   - **RET** (gul/orange): Retired
   - **TP**: Tiltrædelsespoint

3. **Automatisk udmelding ved DNS-grænsen (din grænse: 3)**
   - I dag flyttes en kører kun til ventelisten, når grænsen nås. Det ændres til, at køreren **meldes ud af ligaen** — på samme skånsomme måde som når man selv melder sig ud: alle tidligere resultater og holdpoint bevares, og pladsen går videre til næste godkendte på ventelisten (som får besked som i dag).
   - Køreren får en **DM på Discord** og en notifikation på siden, fx:
     > "Du er blevet meldt ud af ICE Cup, fordi du har 3 DNS (udeblivelser) i denne sæson, og ligaens grænse er 3. Det gør vi for at holde griddet fyldt for dem, der kører. Dine resultater står stadig i stillingerne. Vi håber at se dig på griddet igen i en kommende liga!"
   - Tjekket køres automatisk, når resultater gemmes/offentliggøres og ved "Genberegn point" — så det virker uanset hvem der uploader.
   - Kun DNS tæller (ikke DNF/RET), og tiltrædelsespoint tæller ikke som DNS.

## Spørgsmål til dig undervejs
Ingen — men bemærk: når ændringen udgives, vil kørere der **allerede** har 3 DNS blive meldt ud og få DM ved næste gemning/genberegning (fx Uffe Frederiksen, Daniel Als, Lasse Jensen ser ud til at have DNS i alle 3 afdelinger). Sig til, hvis det ikke skal gælde bagudrettet.

## Teknisk
- `src/routes/ligaer.$leagueId.index.tsx` (~L1147-1172): manglende celle → DNS hvis entry var aktiv (ikke waitlist, oprettet før `race_date`, ikke udmeldt før); joiner-celle → `ResultStatusBadge status="tp"`. Ny `StatusLegend`-komponent over kører-tabellerne; samme på afdelingssiden.
- `src/lib/result-status.ts` + `ResultStatusBadge.tsx`: tilføj visnings-status `tp` (kun UI, ingen ændring i lagrede data/point).
- Ny server-funktion `enforceDnsLimit(leagueId)` i `src/lib/league-results.functions.ts` (admin-klient): tæller DNS pr. kører (user_id + car_class) i afdelingernes resultater, sammenligner med `class_configs.dns_limit`, soft-withdraw (`withdrawn_at`, lineup `effective_until`) som `leaveLeague`, ventelisteoprykning, notification + `sendDiscordDM`, audit-log. Idempotent (rører kun ikke-udmeldte). Kaldes efter upload/publish/recalc; den eksisterende klientside venteliste-flytning (~L1398-1439 i admin-stillinger) erstattes af kaldet.
- Ingen databasemigrering; ingen ændring i point eller placeringer.
