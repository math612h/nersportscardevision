// Genindmelding efter udmelding (fx DNS-grænsen): i samme klasse skal køreren
// bruge den bil, de kørte før, når ligaens bilvalg er låst. Ny klasse = frit valg.
// Databasen håndhæver samme regel i enforce_entry_signup_rules.

export type PreviousEntry = {
  car_class: string;
  car_model: string | null;
  car_number: number | null;
  withdrawn_at: string | null;
  division_id?: string | null;
};

export type CarLockSettings = {
  car_lock_never?: boolean | null;
  car_lock_at?: string | null;
};

export function isCarSelectionLocked(league: CarLockSettings | null | undefined, now = Date.now()): boolean {
  if (!league || league.car_lock_never) return false;
  if (!league.car_lock_at) return false;
  const at = new Date(league.car_lock_at).getTime();
  return Number.isFinite(at) && at <= now;
}

export function resignupLockedCar(
  previous: PreviousEntry[],
  carClass: string,
  league: CarLockSettings | null | undefined,
  now = Date.now(),
): { carModel: string; carNumber: number | null } | null {
  if (!carClass || !isCarSelectionLocked(league, now)) return null;
  const latest = previous
    .filter((e) => e.car_class === carClass && !e.division_id && e.withdrawn_at && e.car_model?.trim())
    .sort((a, b) => new Date(b.withdrawn_at!).getTime() - new Date(a.withdrawn_at!).getTime())[0];
  if (!latest) return null;
  return { carModel: latest.car_model!, carNumber: latest.car_number };
}
