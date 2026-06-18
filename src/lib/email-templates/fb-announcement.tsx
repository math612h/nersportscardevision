import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  leagueName?: string
  text?: string
  bannerUrl?: string | null
  discordReminder?: string
}

const FbAnnouncementEmail = ({ leagueName, text, bannerUrl, discordReminder }: Props) => {
  const league = leagueName || 'liga'
  const body = text || ''
  return (
    <Html lang="da" dir="ltr">
      <Head />
      <Preview>Facebook-annoncering klar til {league}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Facebook-annoncering</Heading>
          <Text style={intro}>
            Her er en færdig opslagstekst til <strong>{league}</strong> klar til at
            kopiere ind i Facebook-gruppen. Hvis der er et banner, kan du
            højreklikke og gemme billedet — eller bruge linket nederst.
          </Text>
          <Section style={textBox}>
            <Text style={preText}>{body}</Text>
          </Section>
          {bannerUrl ? (
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Img
                src={bannerUrl}
                alt={`${league} banner`}
                style={{ maxWidth: '100%', height: 'auto', borderRadius: 8 }}
              />
              <Text style={small}>
                Banner-URL: <Link href={bannerUrl} style={link}>{bannerUrl}</Link>
              </Text>
            </Section>
          ) : null}

          {discordReminder ? (
            <Section style={reminderBox}>
              <Text style={reminderTitle}>📢 HUSK</Text>
              <Text style={preText}>{discordReminder}</Text>
            </Section>
          ) : null}

          <Hr style={hr} />
          <Text style={signature}>
            LMU Danmark<br />
            <Link href="https://www.lmudanmark.dk" style={link}>www.lmudanmark.dk</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: FbAnnouncementEmail,
  subject: (data: Record<string, any>) =>
    `FB-annoncering: ${data?.leagueName || 'ny liga'}`,
  displayName: 'FB-annoncering (admin)',
  previewData: {
    leagueName: 'GT3 Vinterserie 2026',
    text: '🏁 TILMELDINGEN ER ÅBEN!\n\n🏆 GT3 Vinterserie 2026\n\nSå er det nu! Sæt dig klar i pit-lane og snup din plads inden den er væk. 🔥\n\n👉 Tilmeld dig her: https://www.lmudanmark.dk/ligaer/...',
    bannerUrl: null,
    discordReminder: 'HUSK: Du skal være medlem af vores Discord for at få fuld adgang til hjemmesiden og ligaerne.\nJoin her: https://discord.gg/7Ye7R9qAHF',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '640px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0b0b0b', margin: '0 0 16px' }
const intro = { fontSize: '14px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const textBox = {
  backgroundColor: '#f6f6f6',
  border: '1px solid #e5e5e5',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '8px 0',
}
const reminderBox = {
  backgroundColor: '#fff8e1',
  border: '1px solid #ffd54f',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '16px 0',
}
const reminderTitle = {
  fontSize: '15px',
  fontWeight: 'bold' as const,
  color: '#0b0b0b',
  margin: '0 0 8px',
}
const preText = {
  fontSize: '14px',
  color: '#0b0b0b',
  lineHeight: '1.6',
  margin: 0,
  whiteSpace: 'pre-wrap' as const,
  fontFamily: 'Arial, sans-serif',
}
const small = { fontSize: '12px', color: '#666666', margin: '8px 0 0', wordBreak: 'break-all' as const }
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const signature = { fontSize: '14px', color: '#555555', lineHeight: '1.6' }
const link = { color: '#c8102e', textDecoration: 'underline' }
