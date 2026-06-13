# Ligaarkiv (kladder)

Ligaer skal kunne være "kladder" — synlige for admins, men skjulte for offentligheden — indtil de bliver publiceret.

## 1. Database
Tilføj kolonne på `leagues`:
- `published BOOLEAN NOT NULL DEFAULT true`

Alle eksisterende ligaer markeres som `true` (uændret opførsel). Nyoprettede via "Arkiver" gemmes som `false`.

## 2. Admin: Kontrolpanel → Ligaer

I `src/routes/_authenticated._admin.admin.ligaer.tsx`:
- Listen viser kun publicerede ligaer som standard.
- Ny knap øverst: **"Arkiv"** (toggler visningen til arkiverede / ikke‑publicerede ligaer). Når arkiv er aktivt, viser overskriften "Ligaer (arkiv)" og knappen skifter til "Aktive ligaer".
- På hvert kort i arkivet: badge "Kladde" + ekstra knap "Publicer" (sætter `published = true`).
- På hvert kort blandt aktive: lille "Arkiver"-handling (sætter `published = false`).

## 3. Opret/rediger‑dialogerne

I stedet for én "Opret"/"Gem"-knap har dialogen nu to knapper i footeren:
- **"Arkiver"** (secondary) — gemmer/opretter med `published = false`.
- **"Publicer"** (primary) — gemmer/opretter med `published = true`.

Gælder både "Ny liga"-dialogen og "Rediger liga"-dialogen (`EditLeagueDialog`). I redigeringsdialogen vises den aktuelle status som badge i toppen.

## 4. Skjul kladder for offentligheden

Tilføj `.eq("published", true)` til:
- `src/routes/lmu.liga.tsx` (liga-oversigten)
- `src/routes/sitemap[.]xml.ts`
- `src/routes/ligaer.$leagueId.index.tsx` (single league — vis 404 hvis ikke publiceret og brugeren ikke er admin)
- `src/routes/ligaer.$leagueId.regler.tsx`
- `src/routes/ligaer.$leagueId.afdeling.$divisionId.tsx`
- `src/routes/api/public/cron/league-open.ts` (kør ikke Discord-åbningsbesked for kladder)
- `src/lib/discord.functions.ts` queries der bruges til offentlige opslag

Admin-stier (`/admin/ligaer/...`) og admin queries forbliver upåvirkede — admin kan stadig redigere kladder.

## 5. Detaljer
- Eksisterende `del`-mutation forbliver (sletter helt). "Arkiver" er ikke det samme som "slet".
- Når en kladde publiceres første gang og har `signup_opens_at` i fortiden, lader vi cron'en håndtere Discord-beskeden som normalt (resettes ikke automatisk).
- RLS: eksisterende admin-policy dækker allerede læsning/skrivning af alle rækker; vi tilføjer en betingelse til offentlig SELECT-policy så `anon`/`authenticated` kun kan se `published = true`.

## Teknisk

```sql
ALTER TABLE public.leagues
  ADD COLUMN published BOOLEAN NOT NULL DEFAULT true;

-- Eksisterende offentlige SELECT-policy opdateres til at kræve published = true
-- (admin-policy uændret, så admins ser alle).
```

I React: én delt `submit(publish: boolean)` funktion i hver dialog, kaldt fra to knapper.
