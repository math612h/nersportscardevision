import * as React from 'react'
import { render } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { template as leagueOpenTemplate } from '@/lib/email-templates/league-open'

const SITE_NAME = 'lmudanmark-dk'
const SENDER_DOMAIN = 'notify.www.lmudanmark.dk'
const FROM_DOMAIN = 'www.lmudanmark.dk'
const SITE_URL = 'https://www.lmudanmark.dk'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const DISCORD_ANNOUNCE_CHANNEL_ID = '1514985014255943881'
const DISCORD_MEMBERS_ROLE_ID = '1336326061654278186'

function formatDanishDate(iso: string | null | undefined): string {
  if (!iso) return 'TBA'
  try {
    return new Date(iso).toLocaleDateString('da-DK', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen',
    })
  } catch { return 'TBA' }
}

async function postDiscordAnnouncement(args: {
  leagueName: string
  leagueUrl: string
  classConfigs: Array<{ car_class?: string; driver_category?: string; max_drivers?: number }> | null
  divisions: Array<{ name: string | null; track: string | null; layout: string | null; race_date: string | null }>
  bannerUrl: string | null
}): Promise<boolean> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) {
    console.warn('DISCORD_BOT_TOKEN not set — skipping Discord announcement')
    return false
  }

  const classLines = (args.classConfigs ?? [])
    .filter((c) => c?.car_class)
    .map((c) => {
      const cat = c.driver_category ? ` (${c.driver_category})` : ''
      const seats = typeof c.max_drivers === 'number' ? ` — **${c.max_drivers} pladser**` : ''
      return `• ${c.car_class}${cat}${seats}`
    })

  const calendarLines = args.divisions
    .slice()
    .sort((a, b) => {
      const ax = a.race_date ? new Date(a.race_date).getTime() : Infinity
      const bx = b.race_date ? new Date(b.race_date).getTime() : Infinity
      return ax - bx
    })
    .map((d, i) => {
      const round = `R${i + 1}`
      const track = [d.track, d.layout].filter(Boolean).join(' – ') || d.name || 'TBA'
      return `• **${round}** — ${track} — 📆 ${formatDanishDate(d.race_date)}`
    })

  const parts: string[] = []
  parts.push(`<@&${DISCORD_MEMBERS_ROLE_ID}>`)
  parts.push('')
  parts.push('🏁🏁🏁  **TILMELDINGEN ER ÅBEN!**  🏁🏁🏁')
  parts.push('')
  parts.push(`🏆 **${args.leagueName}**`)
  parts.push('')
  parts.push('Så er det nu! Sæt dig klar i pit-lane og snup din plads inden den er væk. 🔥')
  parts.push('')
  if (classLines.length) {
    parts.push('🏎️ **Klasser & pladser**')
    parts.push(...classLines)
    parts.push('')
  }
  if (calendarLines.length) {
    parts.push('📅 **Sæsonkalender**')
    parts.push(...calendarLines)
    parts.push('')
  }
  parts.push(`👉 **Tilmeld dig her:** ${args.leagueUrl}`)
  parts.push('')
  parts.push('Held og lykke derude — vi ses på banen! 🏎️💨')

  const content = parts.join('\n').slice(0, 1900)

  const url = `https://discord.com/api/v10/channels/${DISCORD_ANNOUNCE_CHANNEL_ID}/messages`
  const headers = {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content,
      allowed_mentions: { parse: [], roles: [DISCORD_MEMBERS_ROLE_ID] },
      ...(args.bannerUrl ? { embeds: [{ image: { url: args.bannerUrl }, color: 0xe11d2a }] } : {}),
    }),
  })
  if (res.ok) return true

  const text = await res.text().catch(() => '')
  console.error('Discord announcement failed', res.status, text)

  if (res.status === 403) {
    const fallbackContent = content.replace(`<@&${DISCORD_MEMBERS_ROLE_ID}>\n\n`, '')
    const fallback = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: fallbackContent,
        allowed_mentions: { parse: [] },
      }),
    })
    if (fallback.ok) {
      console.warn('Discord announcement sent without role mention/embed due to missing permissions')
      return true
    }
    const fallbackText = await fallback.text().catch(() => '')
    console.error('Discord announcement fallback failed', fallback.status, fallbackText)
  }

  return false
}

export const Route = createFileRoute('/api/public/cron/league-open')({
  server: {
    handlers: {
      POST: async () => {
        // Automatic league-open announcements are disabled — admins must send
        // announcements manually via the Besked Hub. The route is kept alive
        // so the existing pg_cron job doesn't error out.
        return Response.json({ ok: true, disabled: true, processed: 0 })
      },
    },
  },
})

