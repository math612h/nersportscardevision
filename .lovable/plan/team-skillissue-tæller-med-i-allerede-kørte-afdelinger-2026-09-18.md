# Team Skillissue tæller med i allerede kørte afdelinger

## Hvad jeg fandt

Team Skillissue tilmeldte sig ICE Cup (LMGT3) i dag kl. 12:46 med to kørere. Begge lineup-rækker har **intet starttidspunkt** — det betyder "gælder fra sæsonstart", så holdet tæller med i Silverstone og Interlagos, som blev kørt før de tilmeldte sig.

Til sammenligning har de to kørere, der kom til hos Odyssé Cronos Racing 15. og 17. september, korrekt fået et starttidspunkt.

Årsagen er, at rettelsen fra i går kun ligger i preview. Den offentlige side, hvor tilmeldingen blev lavet, kører stadig den gamle udgave uden starttidspunkt.

## Hvad der gøres

1. **Ret data for Team Skillissue:** begge lineup-rækker får starttidspunktet 18. september 10:46 (tilmeldingstidspunktet), så holdet først tæller med fra Imola. Silverstone og Interlagos giver dem 0 point — som om de ikke var med, hvilket de ikke var.
2. **Udgiv siden**, så den offentlige tilmelding fremover selv sætter starttidspunktet. Ellers gentager problemet sig ved næste team-tilmelding.
3. **Kontrol bagefter:** tjek at ingen andre lineup-rækker oprettet efter Silverstone mangler starttidspunkt (lige nu er Team Skillissue de eneste to).

Ingen andre holds point ændres, og ingen kørerpoint røres.

## Teknisk

- `update public.league_team_lineup set effective_from = created_at where league_team_entry_id = '854912fc-11b3-4d49-93a9-a860858d7506' and effective_from is null;`
- Ingen kodeændringer nødvendige — `submitTeamForLeague` i `src/lib/league-team-entries.functions.ts` sætter allerede `joinFrom = now()` når ligaen har mindst én afdeling med gemte resultater. Fixet mangler blot at blive udgivet.
- Team-point beregnes on-the-fly i `src/lib/team-points.ts` ud fra `effective_from`, så stillingerne retter sig selv uden genberegning.
