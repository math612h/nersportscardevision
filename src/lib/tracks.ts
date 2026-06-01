export type TrackInfo = { name: string; layouts: string[] };

export const LMU_TRACKS: TrackInfo[] = [
  { name: "Circuit de la Sarthe (Le Mans)", layouts: ["24h Circuit", "Mulsanne No Chicanes"] },
  { name: "Bahrain International Circuit", layouts: ["Endurance Circuit", "Paddock Circuit", "Outer Circuit", "Endurance Inner"] },
  { name: "Spa-Francorchamps", layouts: ["Grand Prix", "Endurance (62 cars)"] },
  { name: "Autodromo Nazionale Monza", layouts: ["Grand Prix", "Curva Grande"] },
  { name: "Sebring International Raceway", layouts: ["Full Circuit", "School Circuit"] },
  { name: "Fuji Speedway", layouts: ["Grand Prix", "Classic (No Chicane)"] },
  { name: "Algarve International Circuit (Portimão)", layouts: ["Full Circuit", "ELMS"] },
  { name: "Circuit of the Americas", layouts: ["Full Circuit", "National"] },
  { name: "Circuit Paul Ricard", layouts: ["1a", "1av2", "1av2-short", "3a"] },
  { name: "Silverstone", layouts: ["Grand Prix (WEC)", "National", "International"] },
  { name: "Autodromo Internazionale Enzo e Dino Ferrari (Imola)", layouts: ["Grand Prix", "ELMS"] },
  { name: "Lusail International Circuit (Qatar)", layouts: ["Grand Prix", "Short"] },
  { name: "Interlagos", layouts: ["Grand Prix"] },
];

export const CAR_CLASSES = ["Hypercar", "LMP2", "LMGT3"] as const;
export const DRIVER_CATEGORIES = ["Pro", "Am"] as const;
