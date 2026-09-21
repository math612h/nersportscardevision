# Hvorfor lineupet stadig viser Daniel og Kenneth

## Hvad data viser

Fjernelserne er gemt korrekt i databasen for Odyssés LMGT3-lineup:

- Kenneth Dahl Pedersen — fjernet 19. sep. 18:02
- Daniel Kokborg — fjernet 21. sep. 13:33
- Aktive: Dan Edvardsen, Lukas Weiss, Mathias Gylden (fra 15. sep.), Lauge Stello (fra 17. sep.)

Så der er ikke noget galt med selve fjernelsen.

## Hvad der så går galt

Skærmbilledet er fra den offentlige side, som stadig kører en ældre udgave af
hjemmesiden. Den udgave viser alle lineup-rækker — også de fjernede — og tæller
dem med i "6 accepteret". Man kan se det direkte på skærmbilledet: der er hverken
sektionen "Tidligere lineup" eller datoerne "tæller fra …" ved Mathias og Lauge,
som den nye udgave viser.

Rettelsen, der kun viser aktive kørere, ligger altså færdig i preview, men er
aldrig nået ud på den offentlige side — den seneste udgivelse blev afbrudt af
sikkerhedsgennemgangen. Sikkerhedspunkterne er nu håndteret.

## Hvad jeg gør

1. Udgiv hjemmesiden, så den offentlige side kører den nye udgave.
2. Kontrollér på den offentlige team-side, at LMGT3-lineupet viser 4 accepterede,
   og at Daniel og Kenneth kun står under "Tidligere lineup".
3. Bekræft at LMP2-lineupet og tidligere team-point er uændrede.
4. Ingen ændringer i data eller pointlogik — der rettes intet i databasen.

## Teknisk

- `src/components/LeagueTeamSignupCard.tsx` filtrerer allerede på `effective_until`
  (aktivt lineup vs. "Tidligere lineup") og tæller kun aktive rækker med.
- Ingen kodeændring er nødvendig; handlingen er en udgivelse plus verifikation
  mod den offentlige URL.
