import * as React from 'react'
import {
  Body,
  Button,
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
  displayName?: string
  leagueName?: string
  leagueUrl?: string
}

const LeagueOpenEmail = ({ displayName, leagueName, leagueUrl }: Props) => {
  const name = displayName?.trim() || 'racer'
  const league = leagueName || 'vores nye liga'
  const url = leagueUrl || 'https://www.lmudanmark.dk'
  return (
    <Html lang="da" dir="ltr">
      <Head />
      <Preview>Tilmeldingen til {league} er åben</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Tilmeldingen er åben</Heading>
          <Section>
            <Text style={text}>Hej {name}</Text>
            <Text style={text}>
              Tilmeldingen til <strong>{league}</strong> er nu åben.
            </Text>
            <Text style={text}>
              Hvis du ønsker at deltage, kan du tilmelde dig via linket nedenfor:
            </Text>
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button style={button} href={url}>
                Gå til {league}
              </Button>
            </Section>
            <Text style={text}>
              Vi anbefaler, at du læser ligaens informationer og regler inden tilmelding.
            </Text>
            <Text style={text}>
              Pladserne fordeles efter de gældende kriterier for den pågældende liga,
              og vi forventer stor interesse. Vi anbefaler derfor, at du tilmelder
              dig hurtigst muligt for at sikre dig den bedst mulige chance for en
              plads på gridden.
            </Text>
            <Text style={text}>
              Vi glæder os til endnu en stærk sæson med tæt, fair og
              konkurrencedygtig racing.
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
  component: LeagueOpenEmail,
  subject: (data: Record<string, any>) =>
    `Tilmeldingen til ${data?.leagueName || 'ny liga'} er åben`,
  displayName: 'Liga: tilmelding åben',
  previewData: {
    displayName: 'Jonas',
    leagueName: 'GT3 Vinterserie 2026',
    leagueUrl: 'https://www.lmudanmark.dk/ligaer/123',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0b0b0b', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const signature = { fontSize: '14px', color: '#555555', lineHeight: '1.6' }
const link = { color: '#c8102e', textDecoration: 'underline' }
const button = {
  backgroundColor: '#c8102e',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '6px',
  padding: '12px 22px',
  textDecoration: 'none',
}
