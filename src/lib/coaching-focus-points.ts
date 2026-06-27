// Shared list of coaching focus points / specialties.
// Used by booking wizard and coach profile editor.

export const COACHING_FOCUS_POINTS = [
  "Racing line",
  "Brake points",
  "Trail braking",
  "Konsistens",
  "Racecraft",
  "Mentalt overskud",
  "Setup-forståelse på basisniveau",
  "Hvor tabes tiden?",
  "Fejl i braking/turn-in",
  "Race incidents",
  "Kvalificering",
  "Konsistens over stint",
  "Track walk",
  "Bilvalg",
  "Strategi",
  "Pit windows",
  "Multiclass awareness",
  "Fokusområder før race",
  'Jeg er helt grøn og ønsker hjælp til "the basics"',
] as const;

export type CoachingFocusPoint = (typeof COACHING_FOCUS_POINTS)[number];

export const COACHING_DURATIONS = [30, 45, 60] as const;
export type CoachingDuration = (typeof COACHING_DURATIONS)[number];
