## Discord-integration

### 1. Database
- Tilføj `discord_user_id` (text) + `discord_username` (text, snapshot) + `discord_linked_at` (timestamptz) på `profiles_private`.
- Tilføj `discord_role_id` (text, nullable) på `leagues`.

### 2. "Forbind Discord" flow
- **Server fn** `startDiscordLink` (auth): genererer signed state (HMAC over `userId:nonce:exp` med `DISCORD_CLIENT_SECRET` som key), returnerer Discord OAuth URL med scope `identify`, redirect `https://lmudanmark.dk/api/public/discord/callback`.
- **Server route** `src/routes/api/public/discord.callback.ts` (GET): verificerer state, exchanger `code` mod token, henter `/users/@me`, gemmer `discord_user_id` på `profiles_private` via `supabaseAdmin`, redirecter til `/profil?discord=ok`.
- **UI**: knap "Forbind Discord" på profil-siden + visning af tilknyttet brugernavn + "Frakobl"-knap (server fn).

### 3. Rolle-tildeling ved liga-tilmelding
- **Server fn** `assignDiscordRoleForEntry(entryId)` (auth):
  - Henter `entry → league.discord_role_id` + user's `discord_user_id`.
  - Kalder Discord API: `PUT /guilds/{guildId}/members/{discordUserId}/roles/{roleId}` med `Authorization: Bot <DISCORD_BOT_TOKEN>`.
  - Logger fejl pænt (bruger ikke på server, ikke medlem, osv.) men blokerer ikke tilmelding.
- Kaldes fra eksisterende liga-tilmeldings-flow efter succesfuld entry-insert.
- Tilsvarende `removeDiscordRoleForEntry` ved afmelding.

### 4. Admin: vælg rolle per liga
- I liga-redigering: nyt felt "Discord rolle-ID" (text input) med hjælpetekst om hvordan man finder det.

### Tekniske detaljer
- State HMAC: `hmac_sha256(DISCORD_CLIENT_SECRET, "${userId}:${nonce}:${exp}")`, base64url. Verificer expiry < 10 min.
- Discord API base: `https://discord.com/api/v10`.
- Bot skal være medlem af serveren og have "Manage Roles" + rolle højere end mål-rollen i listen.
- Alle Discord-kald sker server-side via `createServerFn` / server route — token lækker aldrig.

### Filer der oprettes/ændres
- Migration: `profiles_private` + `leagues` kolonner
- `src/lib/discord.functions.ts` — server fns
- `src/lib/discord.server.ts` — Discord API helpers + HMAC
- `src/routes/api/public/discord.callback.ts` — OAuth callback
- Profil-side: tilføj "Forbind Discord"-sektion
- Liga admin-side: tilføj `discord_role_id` felt
- Liga-tilmeldings-handler: kald `assignDiscordRoleForEntry` efter insert
