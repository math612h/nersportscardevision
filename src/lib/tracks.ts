import { Sun, Cloud, CloudDrizzle, CloudRain, CloudLightning, type LucideIcon } from "lucide-react";

export type TrackInfo = { name: string; layouts: string[] };

export const LMU_TRACKS: TrackInfo[] = [
  { name: "Portimão", layouts: ["Portimão"] },
  { name: "Imola", layouts: ["Imola"] },
  { name: "Interlagos", layouts: ["Interlagos"] },
  { name: "Bahrain", layouts: ["Bahrain", "Outer", "Paddock"] },
  { name: "Cota", layouts: ["Circuit of the Americas", "National"] },
  { name: "Le Mans", layouts: ["24h Circuit", "Mulsanne No Chicanes"] },
  { name: "Fuji", layouts: ["Fuji", "Classic"] },
  { name: "Lusail", layouts: ["Lusail", "Short"] },
  { name: "Monza", layouts: ["Monza", "Curva Grande"] },
  { name: "Sebring", layouts: ["Sebring", "School"] },
  { name: "Spa-Francorchamps", layouts: ["Grand Prix"] },
  { name: "Silverstone", layouts: ["International", "National", "GP Circuit"] },
  { name: "Barcelona", layouts: ["Barcelona"] },
  { name: "Paul Ricard", layouts: ["Paul Ricard", "1a", "1av2", "1av2-short"] },
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
  time_of_day?: number; // hours 0-24
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
  briefing_open_minutes_before?: number; // Drivers Briefing åbner X min før race_date
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
  { key: "time_of_day", label: "Time of day", suffix: "h", step: 1, min: 0 },
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

// LMU has started writing full official track names in the result XML
// (e.g. "Circuit de Spa Francorchamps" instead of "Spa"). Normalize to the
// short canonical names we've always used, so the leaderboard dropdown and
// grouping stay consistent regardless of which naming the file uses.
const TRACK_NAME_ALIASES: { match: string; canonical: string }[] = [
  { match: "spa", canonical: "Spa-Francorchamps" },
  { match: "sarthe", canonical: "Le Mans" },
  { match: "le mans", canonical: "Le Mans" },
  { match: "americas", canonical: "Cota" },
  { match: "cota", canonical: "Cota" },
  { match: "sebring", canonical: "Sebring" },
  { match: "monza", canonical: "Monza" },
  { match: "lusail", canonical: "Lusail" },
  { match: "qatar", canonical: "Lusail" },
  { match: "enzo", canonical: "Imola" },
  { match: "imola", canonical: "Imola" },
  { match: "josé carlos", canonical: "Interlagos" },
  { match: "jose carlos", canonical: "Interlagos" },
  { match: "interlagos", canonical: "Interlagos" },
  { match: "barcelona", canonical: "Barcelona" },
  { match: "algarve", canonical: "Portimão" },
  { match: "portim", canonical: "Portimão" },
  { match: "bahrain", canonical: "Bahrain" },
  { match: "fuji", canonical: "Fuji" },
  { match: "paul ricard", canonical: "Paul Ricard" },
  { match: "silverstone", canonical: "Silverstone" },
];

export function normalizeTrackName(track?: string | null): string {
  const raw = (track ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  for (const r of TRACK_NAME_ALIASES) if (lower.includes(r.match)) return r.canonical;
  return raw;
}

