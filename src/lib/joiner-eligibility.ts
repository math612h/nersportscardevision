// Afgør fra hvilket tidspunkt en tilmelding giver tiltrædelsespoint.
// Afholdte afdelinger før dette tidspunkt, hvor køreren intet resultat har
// i klassen, giver ligaens tiltrædelsespoint.
//
// - Almindelig ligatilmelding: tidspunktet for tilmeldingen.
// - Reserveplads (tilmelding knyttet til én afdeling): kun hvis reserven
//   faktisk kørte afdelingen (et resultat, der ikke er DNS). Tidspunktet er
//   den afdelings starttid, så alle tidligere afdelinger giver point.
// - Venteliste og udmeldte giver aldrig tiltrædelsespoint.

export type JoinerEntry = {
  user_id: string;
  car_class: string;
  created_at: string | null;
  division_id: string | null;
  waitlist: boolean;
  withdrawn_at?: string | null;
};

export type JoinerDivisionRow = {
  user_id?: string;
  car_class?: string;
  joiner?: boolean;
  dns?: boolean;
  status?: string | null;
};

export type JoinerDivision = {
  id: string;
  raceTs: number | null;
  results: JoinerDivisionRow[];
};

export function joinerEligibleFrom(entry: JoinerEntry, divisions: JoinerDivision[]): number | null {
  if (entry.waitlist || entry.withdrawn_at) return null;
  if (!entry.division_id) {
    const ts = entry.created_at ? new Date(entry.created_at).getTime() : NaN;
    return Number.isFinite(ts) ? ts : null;
  }
  const div = divisions.find((d) => d.id === entry.division_id);
  if (!div || div.raceTs == null || !Number.isFinite(div.raceTs)) return null;
  const drove = div.results.some((r) =>
    !r.joiner && r.user_id === entry.user_id && r.car_class === entry.car_class &&
    !r.dns && r.status !== "dns",
  );
  return drove ? div.raceTs : null;
}

/** Earliest eligibility timestamp per `user_id|car_class`. */
export function joinerEligibilityByKey(entries: JoinerEntry[], divisions: JoinerDivision[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    const ts = joinerEligibleFrom(e, divisions);
    if (ts == null) continue;
    const key = `${e.user_id}|${e.car_class}`;
    const cur = out.get(key);
    if (cur == null || ts < cur) out.set(key, ts);
  }
  return out;
}
