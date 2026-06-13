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
}): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) {
    console.warn('DISCORD_BOT_TOKEN not set — skipping Discord announcement')
    return
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

  const res = await fetch(
    `https://discord.com/api/v10/channels/${DISCORD_ANNOUNCE_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [], roles: [DISCORD_MEMBERS_ROLE_ID] },
        ...(args.bannerUrl ? { embeds: [{ image: { url: args.bannerUrl }, color: 0xe11d2a }] } : {}),
      }),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('Discord announcement failed', res.status, text)
  }
}

export const Route = createFileRoute('/api/public/cron/league-open')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
        if (!supabaseUrl || !supabaseServiceKey) {
          return Response.json({ error: 'Server misconfigured' }, { status: 500 })
        }
        // Authenticate caller via anon apikey header
        const apikey = request.headers.get('apikey')
        if (!apikey || apikey !== anonKey) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const nowIso = new Date().toISOString()
        const { data: leagues, error: leaguesErr } = await supabase
          .from('leagues')
          .select('id, name, signup_opens_at, signup_open_notified_at, class_configs, banner_url')
          .lte('signup_opens_at', nowIso)
          .is('signup_open_notified_at', null)
          .not('signup_opens_at', 'is', null)

        if (leaguesErr) {
          console.error('Failed to read leagues', leaguesErr)
          return Response.json({ error: 'db_error' }, { status: 500 })
        }

        if (!leagues?.length) {
          return Response.json({ processed: 0 })
        }

        // Fetch all users with profile info
        const { data: profiles, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, display_name')
        if (profilesErr) {
          console.error('Failed to read profiles', profilesErr)
          return Response.json({ error: 'db_error' }, { status: 500 })
        }

        // Fetch auth users (paginate)
        const userEmails = new Map<string, string>()
        let page = 1
        while (true) {
          const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
          if (error) {
            console.error('Failed to list auth users', error)
            break
          }
          for (const u of data.users) {
            if (u.email) userEmails.set(u.id, u.email)
          }
          if (data.users.length < 1000) break
          page++
        }

        let totalEnqueued = 0
        for (const league of leagues) {
          const leagueUrl = `${SITE_URL}/ligaer/${league.id}`
          const subject = `Tilmeldingen til ${league.name} er åben`

          // Discord announcement (fire-and-forget; failures must not block emails)
          try {
            const { data: divs } = await supabase
              .from('divisions')
              .select('name, track, layout, race_date')
              .eq('league_id', league.id as string)
              .order('race_date', { ascending: true })
            let bannerUrl: string | null = null
            const bannerPath = (league as any).banner_url as string | null
            if (bannerPath) {
              if (bannerPath.startsWith('http')) {
                bannerUrl = bannerPath
              } else {
                const { data: signed } = await supabase.storage
                  .from('league-banners')
                  .createSignedUrl(bannerPath, 60 * 60 * 24 * 30)
                bannerUrl = signed?.signedUrl ?? null
              }
            }
            await postDiscordAnnouncement({
              leagueName: league.name as string,
              leagueUrl,
              classConfigs: (league as any).class_configs ?? null,
              divisions: (divs ?? []) as any,
              bannerUrl,
            })
          } catch (e) {
            console.error('Discord announcement error', e)
          }

          for (const p of profiles ?? []) {
            const email = userEmails.get(p.id as string)
            if (!email) continue

            // Skip suppressed
            const { data: suppressed } = await supabase
              .from('suppressed_emails')
              .select('id')
              .eq('email', email.toLowerCase())
              .maybeSingle()
            if (suppressed) continue

            // Ensure unsubscribe token
            const normalized = email.toLowerCase()
            let unsubToken: string
            const { data: existing } = await supabase
              .from('email_unsubscribe_tokens')
              .select('token, used_at')
              .eq('email', normalized)
              .maybeSingle()
            if (existing && !existing.used_at) {
              unsubToken = existing.token
            } else if (!existing) {
              unsubToken = generateToken()
              await supabase
                .from('email_unsubscribe_tokens')
                .upsert(
                  { token: unsubToken, email: normalized },
                  { onConflict: 'email', ignoreDuplicates: true },
                )
              const { data: stored } = await supabase
                .from('email_unsubscribe_tokens')
                .select('token')
                .eq('email', normalized)
                .maybeSingle()
              unsubToken = stored?.token ?? unsubToken
            } else {
              continue
            }

            const element = React.createElement(leagueOpenTemplate.component, {
              displayName: (p as any).display_name ?? undefined,
              leagueName: league.name,
              leagueUrl,
            })
            const html = await render(element)
            const text = await render(element, { plainText: true })
            const messageId = crypto.randomUUID()

            await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: 'league-open',
              recipient_email: email,
              status: 'pending',
            })

            const { error: enqErr } = await supabase.rpc('enqueue_email', {
              queue_name: 'transactional_emails',
              payload: {
                message_id: messageId,
                to: email,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject,
                html,
                text,
                purpose: 'transactional',
                label: 'league-open',
                idempotency_key: `league-open-${league.id}-${p.id}`,
                unsubscribe_token: unsubToken,
                queued_at: new Date().toISOString(),
              },
            })
            if (enqErr) {
              console.error('enqueue failed', enqErr)
              continue
            }
            totalEnqueued++
          }

          await supabase
            .from('leagues')
            .update({ signup_open_notified_at: new Date().toISOString() })
            .eq('id', league.id)
        }

        return Response.json({ leagues: leagues.length, enqueued: totalEnqueued })
      },
    },
  },
})
