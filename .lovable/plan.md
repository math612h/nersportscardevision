## Mål
Når en protest oprettes med indklagede kørere, får de besked i appen (og på email), kan afgive deres version, og admin/stewards afgør sagen med status + begrundelse + evt. straf-detaljer.

## Database (én migration)

**Ny tabel `protest_involved`** — kobler indklagede brugere til en protest:
- `protest_id`, `user_id` (unik kombination)
- `response` (tekst, deres version), `responded_at`
- RLS: indklaget bruger ser/opdaterer egen række; klager + admin læser alle på sine sager.

**Udvid `protests`**:
- `status` (`open` | `awaiting_responses` | `ruled`)
- `verdict_outcome` (enum: `no_penalty` | `warning` | `time_penalty` | `position_penalty` | `disqualified`)
- `verdict_reason` (tekst)
- `verdict_details` (jsonb — fx sekunder, antal positioner)
- `ruled_by`, `ruled_at`
- Skærp SELECT-policy: kun klager, indklagede, og admin må læse (involvering tjekkes via `protest_involved`).

## Protestformular (afdelingsside)
- "Involverede kørere" bliver dropdown over tilmeldte i ligaen (entries), undtagen klager selv.
- Plus-knap tilføjer endnu en dropdown-række. Gemmer som rækker i `protest_involved`. Beholder `involved_drivers` tekstfelt til visning/historik.

## "Mine sager"-side (`/mine-protests`)
Eksisterer allerede til klagerens sager — udvides til to tabs:
- **Indsendt af mig** — som nu, plus visning af indklagedes svar + endelig afgørelse.
- **Indklaget** — nye sager hvor jeg er indklaget; "Afgiv din version"-form pr. sag (én gang, kan opdateres indtil ruling).
- Badge i top-menuen viser antal sager der venter på mit svar.

## Admin-panel (`/admin/protests`)
- Liste viser status-badge pr. sag.
- Klik åbner detalje-side: original protest, alle indklagedes svar (eller "Ikke svaret endnu"), og formular til afgørelse:
  - Udfald (radio/select)
  - Begrundelse (textarea)
  - Betingede felter: sekunder hvis tidsstraf, positioner hvis position penalty
  - "Send afgørelse" — sætter status, gemmer rul-felter, trigger email.

## Email-notifikationer
Kræver ops\u00e6tning af Lovable email-domæne (DNS-trin). Tre tidspunkter:
1. **Ny protest** → email til hver indklaget med link til "Mine sager".
2. **Indklaget har svaret** → email til admins.
3. **Afgørelse afsendt** → email til klager + alle indklagede med udfald + begrundelse.

Server-fn `notify-protest` kaldes fra hver mutation. Selve email-infrastrukturen (domæne, queue, skabeloner) sættes op via Lovable email-værktøjerne efter du godkender planen — første skridt vil være at vælge afsender-domæne.

## Synlighed
- Klager + indklagede + admin ser fuld sag og afgørelse.
- Øvrige brugere ser intet om sagen; eventuelle straffe afspejles indirekte i stillinger (eksisterende side, ingen ny visning her).

## Tekniske noter
- Migration tilføjer enum-typer `protest_status` og `verdict_outcome`.
- Email-skabeloner som React Email i `src/lib/email-templates/` (oprettes når infra er klar).
- Realtime-opdatering er ikke en del af dette — siden re-fetcher ved navigation.
