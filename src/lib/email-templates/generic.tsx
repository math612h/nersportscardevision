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
  subject?: string
  body?: string
  preview?: string
}

const GenericEmail = ({ subject, body, preview }: Props) => {
  const title = subject?.trim() || 'Besked fra LMU Danmark'
  const paragraphs = (body ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return (
    <Html lang="da" dir="ltr">
      <Head />
      <Preview>{preview || title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{title}</Heading>
          <Section>
            {paragraphs.map((p, i) => (
              <Text key={i} style={text}>
                {p.split('\n').map((line, j, arr) => (
                  <React.Fragment key={j}>
                    {line}
                    {j < arr.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </Text>
            ))}
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
  component: GenericEmail,
  subject: (data: Record<string, any>) =>
    (data?.subject as string)?.trim() || 'Besked fra LMU Danmark',
  displayName: 'Generisk besked',
  previewData: {
    subject: 'Velkommen',
    body: 'Hej!\n\nDette er en eksempelbesked.\n\n— LMU Danmark',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0b0b0b', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const signature = { fontSize: '14px', color: '#555555', lineHeight: '1.6' }
const link = { color: '#c8102e', textDecoration: 'underline' }
