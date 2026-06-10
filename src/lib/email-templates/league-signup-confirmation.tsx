import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  leagueName?: string
}

const LeagueSignupConfirmationEmail = ({ leagueName }: Props) => {
  const league = leagueName || 'vores liga'
  return (
    <Html lang="da" dir="ltr">
      <Head />
      <Preview>Tak for din tilmelding til {league}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Tak for din tilmelding</Heading>
          <Section>
            <Text style={text}>
              Tak for din tilmelding til <strong>{league}</strong>.
            </Text>
            <Text style={text}>
              Vi ser frem til at se dig på gridden.
            </Text>
            <Text style={text}>
              Vi vil samtidig gøre opmærksom på, at vi vægter stabilt fremmøde
              højt. Gentagne udeblivelser uden afbud kan få betydning for
              prioriteringen af driver slots i fremtidige ligaer og events.
            </Text>
            <Text style={text}>
              Har du spørgsmål, er du altid velkommen til at kontakte os.
            </Text>
            <Hr style={hr} />
            <Text style={signature}>
              Med venlig hilsen<br />
              LMU Danmark<br />
              <Link href="https://www.lmudanmark.dk" style={link}>
                www.lmudanmark.dk
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: LeagueSignupConfirmationEmail,
  subject: (data: Record<string, any>) =>
    `Tilmelding bekræftet – ${data?.leagueName || 'LMU Danmark'}`,
  displayName: 'Liga: tilmelding bekræftet',
  previewData: { leagueName: 'GT3 Vinterserie 2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0b0b0b', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const signature = { fontSize: '14px', color: '#555555', lineHeight: '1.6' }
const link = { color: '#c8102e', textDecoration: 'underline' }
