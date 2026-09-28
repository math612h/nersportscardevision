# Ret: brugere kan ikke gemme ændringer på deres profil (bl.a. streambillede)

## Årsag (bekræftet)
Ved sikkerhedsrettelsen blev donationsbeløb og donationsnote skjult for almindelige brugere. Men reglen for "brugere må opdatere egen profil" slår selv netop de to felter op for at tjekke, at de ikke ændres. Opslaget bliver nu afvist, så **alle** profilopdateringer fra ikke-admins fejler — også når man skifter streambillede (billedet uploades, men profilen kan ikke pege på det nye billede).

## Rettelse
- Fjern tjekket af donationsbeløb, donationsnote, donationsniveau og præstationer fra opdateringsreglen. De er allerede beskyttet af en eksisterende database-trigger, som automatisk nulstiller ændringer i de felter fra ikke-admins.
- Behold tjekket af "godkendt"-feltet (så man ikke kan godkende sig selv).
- Donationsdata forbliver skjult for besøgende og almindelige brugere.
- Lille ekstra: grænsen i appen (10 MB) sættes, så den matcher lagerets grænse, så billeder lige under 10 MB ikke fejler uden forklaring.

## Kontrol
- Log ind som almindelig bruger, upload/skift streambillede og gem streamingprofil — begge skal lykkes.
- Bekræft at donationsfelter stadig ikke kan ændres eller læses af almindelige brugere.

## Teknisk
Migration: `DROP POLICY "Users can update own profile"` og genopret med `USING (auth.uid() = id) WITH CHECK (auth.uid() = id AND approved = (select p.approved from profiles p where p.id = auth.uid()))`. Trigger `prevent_privileged_profile_field_edits` håndterer donation_*/achievements. Klient: 10 MB-check i StreamingProfileCard → 10_000_000 bytes.
