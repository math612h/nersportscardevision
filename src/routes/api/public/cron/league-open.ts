import { createFileRoute } from '@tanstack/react-router'

// Automatic league-open announcements are disabled.
// Admins now send all announcements manually via the Besked Hub.
// This route is kept alive (returning a no-op) so the existing pg_cron
// schedule doesn't fail.
export const Route = createFileRoute('/api/public/cron/league-open')({
  server: {
    handlers: {
      POST: async () => Response.json({ ok: true, disabled: true, processed: 0 }),
    },
  },
})
