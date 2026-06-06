// Cars per class for Le Mans Ultimate sign-up dropdown.

export const CARS_BY_CLASS: Record<string, string[]> = {
  Hypercar: [
    "Alpine A424",
    "Aston Martin Valkyrie AMR LMH",
    "BMW M Hybrid V8",
    "BMW M Hybrid V8 Evo (2026)",
    "Cadillac V-Series.R",
    "Ferrari 499P",
    "Genesis GMR-001 LMDh",
    "Glickenhaus SCG 007",
    "Isotta Fraschini Tipo 6-C",
    "Lamborghini SC63",
    "Peugeot 9X8 2023",
    "Peugeot 9X8 2024",
    "Porsche 963",
    "Toyota GR010 Hybrid",
    "Toyota TR010 Hybrid (2026)",
    "Vanwall Vandervell 680",
  ],
  LMP2: [
    "Oreca 07 Gibson",
    "Oreca 07 Gibson ELMS",
  ],
  LMP3: [
    "Ligier JS P325",
    "Ginetta G61-LT-P3 Evo",
    "Duqueine D09",
    "Adess AD25",
  ],
  "GT-E": [
    "Aston Martin Vantage GTE",
    "Chevrolet Corvette C8.R",
    "Ferrari 488 GTE Evo",
    "Porsche 911 RSR-19",
  ],
  LMGT3: [
    "Aston Martin Vantage AMR LMGT3 Evo",
    "BMW M4 LMGT3",
    "BMW M4 LMGT3 Evo",
    "Chevrolet Corvette Z06 LMGT3.R",
    "Ferrari 296 LMGT3",
    "Ferrari 296 LMGT3 Evo",
    "Ford Mustang LMGT3",
    "Ford Mustang LMGT3 Evo",
    "Lamborghini Huracán LMGT3 Evo 2",
    "Lexus RC F LMGT3",
    "Mercedes-AMG LMGT3",
    "McLaren 720S LMGT3 Evo",
    "Porsche 911 LMGT3 R (992)",
    "Porsche 911 LMGT3 R (992) 2026",
  ],
};

// LMU official class colours: Hypercar=red, LMP2=blue, LMGT3=green, LMP3=purple, GT-E=orange.
export type ClassColor = {
  dot: string;        // bg-* for a small swatch dot
  badge: string;      // full badge classes (bg + text + border)
  border: string;     // left accent / outline border
  text: string;       // text colour for headings
};

export const CLASS_COLORS: Record<string, ClassColor> = {
  Hypercar: {
    dot: "bg-red-500",
    badge: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40",
    border: "border-l-red-500",
    text: "text-red-600 dark:text-red-400",
  },
  LMP2: {
    dot: "bg-blue-500",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/40",
    border: "border-l-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  LMGT3: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40",
    border: "border-l-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  LMP3: {
    dot: "bg-purple-500",
    badge: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/40",
    border: "border-l-purple-500",
    text: "text-purple-600 dark:text-purple-400",
  },
  "GT-E": {
    dot: "bg-orange-500",
    badge: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/40",
    border: "border-l-orange-500",
    text: "text-orange-600 dark:text-orange-400",
  },
};

export function classColor(carClass: string): ClassColor {
  return (
    CLASS_COLORS[carClass] ?? {
      dot: "bg-muted-foreground",
      badge: "bg-muted text-foreground border-border",
      border: "border-l-border",
      text: "text-foreground",
    }
  );
}
