// Fælles point-, drop-runde- og sorteringsregler for kørerstillinger.
// Bruges af stillingstabellen, "Din mesterskabsplacering" og forsidens Driver Boks,
// så de altid viser præcis det samme.
import { isResultStatus, type ResultStatus } from "@/lib/result-status";

export type ResultRow = {
  user_id?: string;
  car_number: number;
  driver_name: string;
  car_class: string;
  driver_category: string;
  class_position: number;
  points: number;
  penalty_seconds?: number;
  penalty_points?: number;
  dns?: boolean;
};

export type StandingAgg = {
  user_id?: string;
  car_number: number;
  driver_name: string;
  car_class: string;
  driver_category: string;
  race: number;
  total: number;
  penalty: number;
  pointPenalty: number;
  dnsCount: number;
  dnfCount: number;
  rounds: Record<string, { points: number; position: number; penalty: number; pointPenalty: number; dns: boolean; status: ResultStatus | null; joiner: boolean }>;
  dropped?: Set<string>;
};

export type StandingsEntry = { user_id: string; car_class: string; driver_category: string | null; car_number: number | null };

export function aggregateStandings(
  completed: any[],
  leagueEntries: StandingsEntry[],
  dropRounds: number,
): StandingAgg[] {
  // Kategori (Pro/Am) følger kørerens aktuelle tilmelding, så flyttede kørere
  // ikke bliver stående i deres tidligere klasse i tidligere afdelinger.
  const currentCatByUser = new Map<string, string>();
  const currentCatByNumber = new Map<string, string>();
  for (const e of leagueEntries) {
    if (!e.driver_category) continue;
    currentCatByUser.set(`${e.user_id}|${e.car_class}`, e.driver_category);
    if (e.car_number != null) currentCatByNumber.set(`${e.car_class}|${e.car_number}`, e.driver_category);
  }
  const resolveCat = (r: ResultRow) =>
    (r.user_id ? currentCatByUser.get(`${r.user_id}|${r.car_class}`) : undefined) ??
    currentCatByNumber.get(`${r.car_class}|${r.car_number}`) ??
    r.driver_category;

  const map = new Map<string, StandingAgg>();
  for (const d of completed as any[]) {
    for (const r of d.settings.results as ResultRow[]) {
      const cat = resolveCat(r as any);
      const key = r.user_id
        ? `${r.user_id}|${r.car_class}`
        : `legacy|${r.car_class}|${cat}|${r.car_number}`;
      const cur = map.get(key) ?? {
        user_id: r.user_id,
        car_number: r.car_number,
        driver_name: r.driver_name,
        car_class: r.car_class,
        driver_category: cat,
        race: 0,
        total: 0,
        penalty: 0,
        pointPenalty: 0,
        dnsCount: 0,
        dnfCount: 0,
        rounds: {},
      };
      const pen = Number(r.penalty_seconds ?? 0);
      const ptsPen = Math.max(0, Number(r.penalty_points ?? 0));
      cur.race += r.points;
      cur.total += r.points - ptsPen;
      cur.penalty += pen;
      cur.pointPenalty += ptsPen;
      const rowStatus = isResultStatus((r as any).status)
        ? ((r as any).status as ResultStatus)
        : (r as any).dns
          ? "dns"
          : null;
      if (rowStatus === "dns") cur.dnsCount += 1;
      if (rowStatus === "dnf") cur.dnfCount += 1;
      cur.rounds[d.id] = { points: r.points, position: r.class_position, penalty: pen, pointPenalty: ptsPen, dns: !!r.dns, status: rowStatus, joiner: !!(r as any).joiner };
      map.set(key, cur);
    }
  }

  // Drop-runder: hver kørers værste afdelinger (laveste løbspoint)
  // streges og tæller ikke i totalen. DNS (0 point) og tiltrædelsespoint tæller
  // med som mulige drop-runder. Kun når der er kørt flere afdelinger end antallet.
  if (dropRounds > 0 && completed.length > dropRounds) {
    for (const agg of map.values()) {
      const nets = Object.entries(agg.rounds)
        .map(([divId, c]) => ({ divId, net: c.points }))
        .sort((a, b) => a.net - b.net);
      const dropped = new Set(nets.slice(0, dropRounds).map((n) => n.divId));
      if (dropped.size === 0) continue;
      agg.dropped = dropped;
      for (const divId of dropped) {
        const c = agg.rounds[divId];
        // Kun løbspoint droppes; idømte strafpoint trækkes altid fra totalen.
        agg.total -= c.points;
      }
    }
  }

  return Array.from(map.values());
}

// Samme sortering som stillingstabellen: point, derefter færrest DNS,
// derefter færrest DNF/NT/DSQ.
export function compareStandings(a: StandingAgg, b: StandingAgg): number {
  if (b.total !== a.total) return b.total - a.total;
  if (a.dnsCount !== b.dnsCount) return a.dnsCount - b.dnsCount;
  const aNonFinish = a.dnfCount + Object.values(a.rounds).filter((c) => c.status === "nt" || c.status === "dsq").length;
  const bNonFinish = b.dnfCount + Object.values(b.rounds).filter((c) => c.status === "nt" || c.status === "dsq").length;
  return aNonFinish - bNonFinish;
}

export type DriverDuel = {
  position: number;
  total: number;
  ahead: { name: string; carNumber: number | null; gap: number } | null;
  behind: { name: string; carNumber: number | null; gap: number } | null;
};

// Kørerens placering i sin klasse/kategori plus køreren lige foran og lige bagved.
// gap er altid et positivt antal point (foran: hvor meget de fører; bagved: hvor meget man fører).
export function driverDuel(
  rows: StandingAgg[],
  userId: string,
  carNumberFor?: (r: StandingAgg) => number | null,
): DriverDuel | null {
  const sorted = [...rows].sort(compareStandings);
  const idx = sorted.findIndex((r) => r.user_id === userId);
  if (idx < 0) return null;
  const me = sorted[idx];
  const num = (r: StandingAgg) => (carNumberFor ? carNumberFor(r) : r.car_number) ?? null;
  const a = sorted[idx - 1];
  const b = sorted[idx + 1];
  return {
    position: idx + 1,
    total: me.total,
    ahead: a ? { name: a.driver_name, carNumber: num(a), gap: a.total - me.total } : null,
    behind: b ? { name: b.driver_name, carNumber: num(b), gap: me.total - b.total } : null,
  };
}
