import { Sun, Cloud, CloudDrizzle, CloudRain, CloudLightning, type LucideIcon } from "lucide-react";

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
  { name: "Circuit de Barcelona-Catalunya", layouts: ["Grand Prix", "National"] },
];

export const CAR_CLASSES = ["Hypercar", "LMP2", "LMP3", "GT-E", "LMGT3"] as const;
export const DRIVER_CATEGORIES = ["Pro", "Am", "Open"] as const;

export type ClassConfig = {
  car_class: string;
  driver_category: string;
  number_from: number;
  number_to: number;
  max_drivers?: number; // optional grid cap (waitlist activates when exceeded)
  dns_limit?: number;   // optional max DNS before driver auto-moves to waitlist
};

export type OnOff = "On" | "Off";
export const ON_OFF_OPTIONS: OnOff[] = ["On", "Off"];

export type EventSettings = {
  practice_minutes?: number;
  quali_minutes?: number;
  race_minutes?: number;
  in_game_time?: string; // HH:MM (24h)
  time_scale?: number; // e.g. 1, 2, 5, 10, 30
  fuel_consumption?: number; // multiplier
  tyre_wear?: number; // multiplier
  anti_lock_brakes?: OnOff;
  auto_shift?: OnOff;
  brake_help?: OnOff;
  driving_line?: OnOff;
  stability_control?: OnOff;
  steering_help?: OnOff;
  auto_clutch?: OnOff;
};

export const EVENT_AID_FIELDS: { key: keyof EventSettings; label: string }[] = [
  { key: "anti_lock_brakes", label: "Anti Lock Brakes" },
  { key: "auto_shift", label: "Auto Shift" },
  { key: "brake_help", label: "Brake Help" },
  { key: "driving_line", label: "Driving Line" },
  { key: "stability_control", label: "Stability Control" },
  { key: "steering_help", label: "Steering Help" },
  { key: "auto_clutch", label: "Auto Clutch" },
];

export const EVENT_NUMERIC_FIELDS: { key: keyof EventSettings; label: string; suffix?: string; step?: number; min?: number }[] = [
  { key: "practice_minutes", label: "Practice", suffix: "min", min: 0 },
  { key: "quali_minutes", label: "Qualifying", suffix: "min", min: 0 },
  { key: "race_minutes", label: "Race", suffix: "min", min: 0 },
  { key: "time_scale", label: "Time scale", suffix: "x", step: 1, min: 1 },
  { key: "fuel_consumption", label: "Fuel consumption", suffix: "x", step: 0.1, min: 0 },
  { key: "tyre_wear", label: "Tyre wear", suffix: "x", step: 0.1, min: 0 },
];

export type WeatherKey = "sunny" | "cloudy" | "light_rain" | "moderate_rain" | "storm";
export const WEATHER_OPTIONS: { key: WeatherKey; label: string; icon: LucideIcon }[] = [
  { key: "sunny", label: "Sol", icon: Sun },
  { key: "cloudy", label: "Overskyet", icon: Cloud },
  { key: "light_rain", label: "Let regn", icon: CloudDrizzle },
  { key: "moderate_rain", label: "Moderat regn", icon: CloudRain },
  { key: "storm", label: "Storm", icon: CloudLightning },
];
export const WEATHER_BY_KEY: Record<WeatherKey, { label: string; icon: LucideIcon }> = Object.fromEntries(
  WEATHER_OPTIONS.map((w) => [w.key, { label: w.label, icon: w.icon }]),
) as Record<WeatherKey, { label: string; icon: LucideIcon }>;
export const WEATHER_SLOT_COUNT = 5;

// Map track-name (lowercase, contains-match) -> filename in the `track-images` storage bucket.
const TRACK_IMAGE_RULES: { match: string; file: string }[] = [
  { match: "le mans", file: "le-mans.png" },
  { match: "sarthe", file: "le-mans.png" },
  { match: "bahrain", file: "bahrain.png" },
  { match: "spa", file: "spa.png" },
  { match: "monza", file: "monza.png" },
  { match: "sebring", file: "sebring.png" },
  { match: "fuji", file: "fuji.png" },
  { match: "portim", file: "portimao.png" },
  { match: "algarve", file: "portimao.png" },
  { match: "americas", file: "cota.png" },
  { match: "cota", file: "cota.png" },
  { match: "paul ricard", file: "paul-ricard.jpg" },
  { match: "silverstone", file: "silverstone.png" },
  { match: "imola", file: "imola.png" },
  { match: "lusail", file: "lusail.jpg" },
  { match: "qatar", file: "lusail.jpg" },
  { match: "interlagos", file: "interlagos.png" },
  { match: "barcelona", file: "barcelona.png" },
];

export function getTrackImageFile(trackName?: string | null): string | null {
  if (!trackName) return null;
  const n = trackName.toLowerCase();
  for (const r of TRACK_IMAGE_RULES) if (n.includes(r.match)) return r.file;
  return null;
}
