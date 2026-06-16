## Mål

- Erstat notifikations-popoveren med en rigtig beskedside (`/beskeder`).
- Venstre side: liste over samtaler (System øverst + alle DM-tråde, søgbar).
- Midten: chat-vindue med beskeder.
- Direkte beskeder mellem alle brugere (også ikke-godkendte).
- Web Push på mobil/PWA når man får ny besked eller ny notifikation.

## UI

**Route:** `src/routes/_authenticated.beskeder.tsx` (+ valgfri `$threadId`)

```
┌──────────────────────────────────────────────┐
│ AppHeader (klokke → /beskeder, ingen popover)│
├────────────┬─────────────────────────────────┤
│ Søg bruger │  Modtager-navn          ⋯       │
│ ─────────  │ ─────────────────────────────── │
│ ⚙ System 3 │                                 │
│ Anders   1 │  beskeder (boble-stil)          │
│ Maria      │                                 │
│ Peter      │                                 │
│            │ ─────────────────────────────── │
│            │ [skriv besked...]        [Send] │
└────────────┴─────────────────────────────────┘
```

- Mobil: liste først; tap åbner chat (fuldskærm) med tilbageknap.
- System-tråden viser eksisterende `notifications`-rows, klikbare links, ingen tekstfelt.
- Brugersøgning i toppen af sidebar (alle profiler, ikke kun godkendte).
- Realtime via Supabase channel.

## Header-ændring

`NotificationsBell` → simpelt link til `/beskeder` med uread-badge (sum af ulæste DMs + ulæste notifikationer). Popover fjernes.

## Database

Ny migration:

- `direct_messages(id, sender_id, recipient_id, body text, created_at, read_at)` — RLS: kun afsender/modtager ser; insert kun som sig selv; update af `read_at` kun som modtager.
- `push_subscriptions(id, user_id, endpoint unique, p256dh, auth, user_agent, created_at)` — RLS: ejer.
- Realtime publication: tilføj `direct_messages` og `notifications`.
- GRANTs på begge.

## Server functions

`src/lib/messages.functions.ts`:
- `listThreads()` — returner system-tråd-meta + DM-tråde (sidste besked, ulæst-count).
- `getThread({ otherUserId })` — beskeder + marker som læst.
- `sendMessage({ recipientId, body })` — insert + trigger push.
- `searchUsers({ q })` — profil-søgning.

`src/lib/push.functions.ts`:
- `getVapidPublicKey()`, `savePushSubscription({ ... })`, `removePushSubscription({ endpoint })`.

`src/lib/push.server.ts`: `sendPushToUser(userId, { title, body, url })` via `web-push` med VAPID. Kaldes fra:
- `sendMessage` (DM)
- Eksisterende notifikations-insert-steder (lille helper der wrapper)

## Web Push / PWA

- Tilføj `web-push` dep.
- Generér VAPID-nøgler én gang, gem som secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Service worker `public/push-sw.js` (messaging-only, ikke app-shell cache — undgår Lovable preview-problemer).
- Klient-helper registrerer SW + henter VAPID-public-key + beder om `Notification.requestPermission()` ved første besøg på `/beskeder` (med en "Aktiver notifikationer"-knap, ikke auto-prompt).
- Manifest har allerede `apple-touch-icon` etc.; iOS PWA push virker når brugeren har "Add to Home Screen".

## Tekniske detaljer

- `direct_messages` index: `(recipient_id, sender_id, created_at desc)` for thread-lookup; thread-key = sorteret par `(least(a,b), greatest(a,b))`.
- Ulæste-count: `count(*) where recipient_id = me and read_at is null`.
- Markér læst når thread åbnes (server fn).
- Push payload: `{ title, body, url, tag }`; SW viser notifikation + `notificationclick` → `clients.openWindow(url)`.
- Push fails (410/404) → slet subscription.

## Filer der oprettes/ændres

Nye:
- `src/routes/_authenticated.beskeder.tsx`
- `src/routes/_authenticated.beskeder.$threadId.tsx` (valgfrit hvis vi vil have URL pr. tråd)
- `src/lib/messages.functions.ts`
- `src/lib/push.functions.ts`
- `src/lib/push.server.ts`
- `public/push-sw.js`
- `src/lib/push-client.ts` (registrering + subscription)
- Migration

Ændres:
- `src/components/NotificationsBell.tsx` → simpel badge-link
- `src/components/AppHeader.tsx` (måske bare label-ændring)
- Steder der inserter i `notifications` (admin-notify, onboarding, team-message-trigger m.fl.) får et call til `sendPushToUser` — eller endnu bedre: DB-trigger der enqueuer + en single server route der sender push når en `notifications`-row inserts. Jeg vælger sidstnævnte: en trigger der kalder `pg_net` er overkill — i stedet kalder vi `sendPushToUser` direkte fra de eksisterende server-fns der allerede inserter notifications (begrænset antal steder).

## Note om scope

Det her er ~6-8 nye filer + migration + secrets. Jeg leverer alt på én gang. VAPID-nøgler genererer jeg selv og lægger ind via secrets-værktøjet (offentlig nøgle bruges også på klient — den henter vi via server fn så vi ikke skal bruge `VITE_`).