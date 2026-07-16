
# Ugens Overhaling

En ny sektion hvor brugere kan indsende YouTube-klip af overhalinger. Hver uge kan der stemmes, og ugens vinder vises på forsiden.

## Datamodel (Lovable Cloud)

**`overtaking_clips`**
- `id` uuid pk
- `user_id` uuid → auth.users (indsender)
- `youtube_url` text (rå input)
- `youtube_id` text (parset video-id, indexeret)
- `title` text nullable (valgfri beskrivelse)
- `week_start` date (mandag i ugen, DK/Europe-Copenhagen)
- `created_at`, `updated_at`
- RLS:
  - authenticated: SELECT alle
  - authenticated: INSERT egne (user_id = auth.uid())
  - authenticated: DELETE/UPDATE egne
  - admin: alt (via `has_role`)
- GRANTs til authenticated + service_role. Anon: kun SELECT (så forsiden virker uden login).

**`overtaking_votes`**
- `id` uuid pk
- `clip_id` uuid → overtaking_clips on delete cascade
- `user_id` uuid → auth.users
- `week_start` date (denormaliseret for hurtig "1 stemme pr. uge" constraint)
- `created_at`
- UNIQUE `(user_id, week_start)` — én stemme pr. bruger pr. uge
- RLS: authenticated kan SELECT alle, INSERT egne kun for indeværende uge, DELETE egne kun i indeværende uge.

**Vinder** beregnes on-the-fly som klippet med flest stemmer i en given (afsluttet) uge. Ingen separat tabel — enklest og altid korrekt.

## Uge-beregning

Uger går mandag 00:00 → søndag 23:59 Europe/Copenhagen. Client + server har fælles util:
- `getWeekStart(date)` → `YYYY-MM-DD` (mandag)
- "indeværende uge" = `week_start === getWeekStart(now())`
- Historiske uger: `week_start < getWeekStart(now())` → ingen stemmer tilladt.

## YouTube-parsing

Util parser `youtu.be/<id>`, `youtube.com/watch?v=<id>`, `youtube.com/shorts/<id>`, `youtube.com/embed/<id>`. Ugyldigt link afvises client- og server-side (zod). Embed via `https://www.youtube.com/embed/<id>` i responsiv 16:9 wrapper.

## Ruter og filer

- **`src/routes/ugens-overhaling.tsx`** — offentlig side
  - Uge-vælger: pile ← → + label ("Uge 29 · 14.–20. jul"). Default = indeværende uge.
  - Grid af klip-kort: embed, indsender (avatar + navn via `DriverLink`), stemmetal, "Stem"-knap.
  - Stem-knap kun i indeværende uge og kun for logged-in ikke-guests. Én stemme; klik igen på samme klip = fjern stemme, klik på andet klip = flyt stemme.
  - "Indsend klip"-knap (dialog med YouTube-URL + valgfri titel). Kun logged-in ikke-guests.
  - Historiske uger: viser vinder-badge på klippet med flest stemmer.
- **Forside `src/routes/index.tsx`**:
  - Ny knap i quick-links-rækken: "Ugens Overhaling" (Video-ikon, lucide `Video`), linker til `/ugens-overhaling`.
  - Ny sektion under nyheder (eller lige over): "Ugens Overhaling — vinder", der viser sidste afsluttede uges vinderklip embed + indsender. Skjules hvis ingen stemmer/klip.
- **Admin `src/routes/_authenticated._admin.admin.overhalinger.tsx`**:
  - Liste grupperet efter uge (nyeste først), embed thumbnails, indsender, stemmetal.
  - Slet-knap pr. klip med bekræftelses-dialog (`AlertDialog`).
  - Tilføjes til `AdminSidebar` og `AdminCommandPalette`.
- **Server functions** `src/lib/overtaking.functions.ts`:
  - `listClipsForWeek({ weekStart })` — public (server publishable client), returnerer klip + stemmetal + indsender-profil-fields (display_name, avatar_path).
  - `getCurrentWinner()` — public, sidste afsluttede uge.
  - `submitClip({ youtubeUrl, title })` — `requireSupabaseAuth`, indsætter for indeværende uge.
  - `voteForClip({ clipId })` — `requireSupabaseAuth`, upsert (én pr. uge, kan flyttes; samme clip = fjern).
  - `adminDeleteClip({ clipId })` — `requireSupabaseAuth` + `has_role(..., 'admin')` verificeret via `context.supabase`, derefter `supabaseAdmin` til slet.
- **Oversættelser**: nye keys under `home.weeklyOvertake`, `overtaking.*` i da/en/de/it/zh (samme sæt).

## Design

Følger eksisterende visuelle sprog (kort, `Card`, `Button`, muted badges). 16:9 responsiv iframe med `aspect-video rounded-lg overflow-hidden`. Grid: 1 kolonne mobil, 2 tablet, 3 desktop. Uge-vælger som `Button variant="outline"` med `ChevronLeft`/`ChevronRight` og centreret label. Vinder-badge = `Trophy` ikon + accentfarve.

## Sikkerhed

- Server-side validering: zod på youtube_url (regex + parsed id), max titel-længde 120.
- Stem-endpoint tjekker `week_start = current` server-side (ikke client-tillid).
- Admin-check: `context.supabase.from('user_roles').select('role').eq('user_id', context.userId)` før `supabaseAdmin` bruges.
- Rate limit per bruger: max fx 5 klip pr. uge (soft check i handler).

## Trin

1. Migration: tabeller + policies + GRANTs.
2. Utils: `weekStart`, `parseYouTube`.
3. Server functions.
4. Route `/ugens-overhaling` + dialog.
5. Admin-route + sidebar/command-palette entry.
6. Forside-knap + vinder-sektion.
7. i18n keys.
8. Verificér med typecheck og en hurtig manuel klik-igennem.
