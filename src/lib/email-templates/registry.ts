import type { ComponentType } from 'react'
import { template as welcomeTemplate } from './welcome'
import { template as leagueOpenTemplate } from './league-open'
import { template as leagueSignupConfirmationTemplate } from './league-signup-confirmation'
import { template as fbAnnouncementTemplate } from './fb-announcement'
import { template as genericTemplate } from './generic'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  welcome: welcomeTemplate,
  'league-open': leagueOpenTemplate,
  'league-signup-confirmation': leagueSignupConfirmationTemplate,
  'fb-announcement': fbAnnouncementTemplate,
  generic: genericTemplate,
}
