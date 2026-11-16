// Tæller DNS mod ligaens DNS-grænse.
// Kun DNS i afdelinger, der er kørt efter kørerens nuværende tilmelding,
// tæller. Så kan en kører, der er meldt ud pga. grænsen, tilmelde sig igen
// og starte på en frisk — de gamle DNS står stadig i resultaterne.

export type DnsDivision = {
  /** Kun bekræftede resultater tæller. */
  confirmed: boolean;
  /** Afdelingens tidspunkt (ms). null = ukendt → tæller altid. */
  raceTs: number | null;
  results: { user_id?: string | null; car_class?: string | null; status?: string | null; dns?: boolean; joiner?: boolean }[];
};

export function divisionTimestamp(div: { race_date?: string | null; created_at?: string | null; settings?: any }): number | null {
  const raw = div.race_date ?? div.settings?.completed_at ?? div.created_at ?? null;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

/** Antal DNS for kørerens klasse siden `signedUpAt` (ISO). */
export function countDnsSinceSignup(
  userId: string,
  carClass: string,
  signedUpAt: string | null,
  divisions: DnsDivision[],
): number {
  const since = signedUpAt ? new Date(signedUpAt).getTime() : NaN;
  let n = 0;
  for (const d of divisions) {
    if (!d.confirmed) continue;
    if (Number.isFinite(since) && d.raceTs != null && d.raceTs < since) continue;
    for (const r of d.results) {
      if (!r || r.user_id !== userId || r.car_class !== carClass) continue;
      if (r.joiner || r.status === "joiner") continue;
      if (r.status === "dns" || (!r.status && r.dns)) n++;
    }
  }
  return n;
}
