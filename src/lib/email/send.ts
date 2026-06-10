import { supabase } from '@/integrations/supabase/client'

export interface SendTransactionalEmailInput {
  templateName: string
  recipientEmail?: string
  idempotencyKey?: string
  templateData?: Record<string, any>
}

/**
 * Calls the internal transactional email send route with the current user's JWT.
 * Returns silently on error (logged to console) — email failures should never
 * block the calling user flow.
 */
export async function sendTransactionalEmail(input: SendTransactionalEmailInput) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      console.warn('sendTransactionalEmail skipped: no session')
      return { ok: false, reason: 'no_session' as const }
    }
    const res = await fetch('/lovable/email/transactional/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('sendTransactionalEmail failed', res.status, text)
      return { ok: false, reason: 'http_error' as const, status: res.status }
    }
    return { ok: true as const }
  } catch (err) {
    console.error('sendTransactionalEmail threw', err)
    return { ok: false, reason: 'exception' as const }
  }
}
