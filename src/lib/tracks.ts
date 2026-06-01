export type TrackInfo = { name: string; layouts: string[] };

export const LMU_TRACKS: TrackInfo[] = [
  { name: "Circuit de la Sarthe (Le Mans)", layouts: ["24h Circuit"] },
  { name: "Spa-Francorchamps", layouts: ["Grand Prix"] },
  { name: "Monza", layouts: ["Grand Prix"] },
  { name: "Bahrain International Circuit", layouts: ["Grand Prix", "Endurance"] },
  { name: "Imola", layouts: ["Grand Prix"] },
  { name: "Fuji Speedway", layouts: ["Grand Prix"] },
  { name: "Sebring International Raceway", layouts: ["12h Course"] },
  { name: "Autódromo Internacional do Algarve (Portimão)", layouts: ["Grand Prix"] },
  { name: "Circuit of the Americas", layouts: ["Grand Prix"] },
  { name: "Interlagos", layouts: ["Grand Prix"] },
  { name: "Lusail International Circuit", layouts: ["Grand Prix"] },
];

export const CAR_CLASSES = ["Hypercar", "LMP2", "LMGT3"] as const;
export const DRIVER_CATEGORIES = ["Pro", "Silver", "Bronze", "Am"] as const;
