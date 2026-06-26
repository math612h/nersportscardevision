// Helpers til at beregne team-point pr. løb.
//
// Regel (aftalt med brugeren):
//  - Pr. (klasse, team) bruges medianen af lineup-medlemmernes klasse-positioner i løbet
//    som teamets "placering". Mindst 2 accepterede lineup-medlemmer skal faktisk
//    have kørt løbet (ikke DNS) — ellers får teamet 0 point.
//  - Teams i klassen rangeres efter laveste median (bedste); ved lige medianer
//    bruges summen af positionerne som tiebreak.
//  - Pointtildeling: P1 = 30 (override), P2..Pn følger ligaens
//    points_per_position (samme array som for solo). FL-point gives ikke til teams.

export type TeamRaceResultRow = {
  user_id?: string | null;
  car_class: string;
  class_position?: number | null;
  position?: number | null;
  dns?: boolean | null;
  dnf?: boolean | null;
  dsq?: boolean | null;
};

export type LineupTeamInfo = {
  teamId: string;
  teamName: string;
  carClass: string;
  // accepterede lineup-medlemmers user_ids
  userIds: Set<string>;
};

export type TeamPointsResult = {
  teamId: string;
  teamName: string;
  points: number;
  rank: number;
  participants: number;
  median: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  if (sorted.length % 2 === 1) return sorted[Math.floor(mid)];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Solo-pointsystem med P1 overridet til 30. */
export function teamPointsForRank(rank: number, pointsPerPosition: number[]): number {
  if (rank < 1) return 0;
  if (rank === 1) return 30;
  const idx = rank - 1;
  const v = pointsPerPosition[idx];
  return Number.isFinite(v) ? Math.max(0, Number(v)) : 0;
}

/**
 * Beregn team-point for ÉT løb pr. klasse.
 *
 * @returns Map<car_class, TeamPointsResult[]> sorteret efter rank stigende.
 */
export function computeTeamRacePoints(args: {
  results: TeamRaceResultRow[];
  teams: LineupTeamInfo[]; // alle bekræftede team-tilmeldinger med ≥2 lineup-medlemmer
  pointsPerPosition: number[];
}): Map<string, TeamPointsResult[]> {
  const { results, teams, pointsPerPosition } = args;

  // Brugbare resultater pr. klasse
  const validByClass = new Map<string, Map<string, number>>(); // class -> user_id -> position
  for (const r of results) {
    if (!r.user_id || !r.car_class) continue;
    if (r.dns) continue;
    const pos = Number(r.class_position ?? r.position ?? 0);
    if (!Number.isFinite(pos) || pos <= 0) continue;
    if (!validByClass.has(r.car_class)) validByClass.set(r.car_class, new Map());
    validByClass.get(r.car_class)!.set(r.user_id, pos);
  }

  const out = new Map<string, TeamPointsResult[]>();
  const classes = new Set<string>([...teams.map((t) => t.carClass)]);
  for (const cls of classes) {
    const posByUid = validByClass.get(cls) ?? new Map();
    const teamsInClass = teams.filter((t) => t.carClass === cls);
    type Calc = {
      teamId: string;
      teamName: string;
      positions: number[];
      median: number | null;
      sum: number;
    };
    const calcs: Calc[] = teamsInClass.map((t) => {
      const positions: number[] = [];
      for (const uid of t.userIds) {
        const p = posByUid.get(uid);
        if (typeof p === "number" && p > 0) positions.push(p);
      }
      return {
        teamId: t.teamId,
        teamName: t.teamName,
        positions,
        median: positions.length >= 2 ? median(positions) : null,
        sum: positions.reduce((a, b) => a + b, 0),
      };
    });

    // Kun teams med ≥2 deltagende lineup-medlemmer kvalificerer til point
    const qualifying = calcs.filter((c) => c.median != null);
    qualifying.sort((a, b) => {
      if (a.median !== b.median) return (a.median ?? 0) - (b.median ?? 0);
      return a.sum - b.sum;
    });

    const ranked: TeamPointsResult[] = [];
    qualifying.forEach((c, idx) => {
      const rank = idx + 1;
      ranked.push({
        teamId: c.teamId,
        teamName: c.teamName,
        points: teamPointsForRank(rank, pointsPerPosition),
        rank,
        participants: c.positions.length,
        median: c.median,
      });
    });
    // Inkluder også ikke-kvalificerede teams med 0 point (for visning)
    const nonQual = calcs.filter((c) => c.median == null);
    for (const c of nonQual) {
      ranked.push({
        teamId: c.teamId,
        teamName: c.teamName,
        points: 0,
        rank: 0,
        participants: c.positions.length,
        median: null,
      });
    }
    out.set(cls, ranked);
  }
  return out;
}
