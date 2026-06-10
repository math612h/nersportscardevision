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
  displayName?: string
}

const WelcomeEmail = ({ displayName }: Props) => {
  const name = displayName?.trim() || 'racer'
  return (
    <Html lang="da" dir="ltr">
      <Head />
      <Preview>Velkommen til LMU Danmark</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Velkommen, {name}!</Heading>
          <Section>
            <Text style={text}>
              Tusind tak fordi du har oprettet en konto hos LMU Danmark – vi er
              utrolig glade for at have dig med i fællesskabet.
            </Text>
            <Text style={text}>
              Hos os handler det om tæt, fair og konkurrencedygtig sim-racing i
              Le Mans Ultimate. Du kan nu tilmelde dig vores ligaer, oprette
              eller blive en del af et team og dele resultater med resten af
              den danske community.
            </Text>
            <Text style={text}>
              Vi glæder os til at se dig på gridden – held og lykke derude!
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
  component: WelcomeEmail,
  subject: 'Velkommen til LMU Danmark',
  displayName: 'Velkomstmail',
  previewData: { displayName: 'Jonas' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0b0b0b', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const signature = { fontSize: '14px', color: '#555555', lineHeight: '1.6' }
const link = { color: '#c8102e', textDecoration: 'underline' }
