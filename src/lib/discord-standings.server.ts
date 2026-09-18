// Bygger tekst-embeds med liga-stillinger (kørere + teams) til Discord.
import { isResultsPublished } from "@/lib/results-visibility";
import { computeTeamRacePoints, type LineupTeamInfo } from "@/lib/team-points";

type ResultRow = {
  user_id?: string | null;
  car_number: number;
  driver_name: string;
  car_class: string;
  driver_category: string;
  points: number;
  penalty_points?: number | null;
  class_position?: number | null;
  position?: number | null;
  dns?: boolean | null;
  status?: string | null;
};

export type StandingsEmbed = { title: string; description: string; color: number };

const COLOR = 0xe11d48;

function chunkLines(lines: string[], limit = 3900): string[] {
  const out: string[] = [];
  let cur = "";
  for (const l of lines) {
    if (cur.length + l.length + 1 > limit) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + l;
  }
  if (cur) out.push(cur);
  return out.length > 0 ? out : [""];
}

export async function buildLeagueStandingsEmbeds(
  supabaseAdmin: any,
  leagueId: string,
): Promise<{ leagueName: string; channelId: string | null; embeds: StandingsEmbed[] }> {
  const { data: league, error: lerr } = await supabaseAdmin
    .from("leagues")
    .select("id,name,class_configs,points_system,standings_channel_id")
    .eq("id", leagueId)
    .maybeSingle();
  if (lerr) throw lerr;
  if (!league) throw new Error("Liga ikke fundet.");

  const [{ data: divisions }, { data: entries }, { data: teamEntries }] = await Promise.all([
    supabaseAdmin
      .from("divisions")
      .select("id,name,race_date,settings")
      .eq("league_id", leagueId)
      .order("race_date", { ascending: true, nullsFirst: false }),
    supabaseAdmin
      .from("entries")
      .select("user_id,car_class,car_number,driver_category,withdrawn_at")
      .eq("league_id", leagueId),
    supabaseAdmin
      .from("league_team_entries")
      .select(
        "id, team_id, car_class, status, teams:team_id(id,name), league_team_lineup(user_id,status,effective_from,effective_until)",
      )
      .eq("league_id", leagueId)
      .eq("status", "confirmed"),
  ]);

  const completed = ((divisions ?? []) as any[]).filter(
    (d) => d.settings?.completed && isResultsPublished(d.settings) && Array.isArray(d.settings?.results),
  );

  // --- Kørerstillinger ---
  const currentCatByUser = new Map<string, string>();
  const currentCatByNumber = new Map<string, string>();
  const withdrawn = new Set<string>();
  for (const e of (entries ?? []) as any[]) {
    if (e.driver_category) {
      currentCatByUser.set(`${e.user_id}|${e.car_class}`, e.driver_category);
      if (e.car_number != null) currentCatByNumber.set(`${e.car_class}|${e.car_number}`, e.driver_category);
    }
    if (e.withdrawn_at && e.user_id) withdrawn.add(`${e.user_id}|${e.car_class}`);
  }
  const resolveCat = (r: ResultRow) =>
    (r.user_id ? currentCatByUser.get(`${r.user_id}|${r.car_class}`) : undefined) ??
    currentCatByNumber.get(`${r.car_class}|${r.car_number}`) ??
    r.driver_category;

  type Agg = {
    key: string;
    user_id?: string | null;
    driver_name: string;
    car_class: string;
    driver_category: string;
    total: number;
    dnsCount: number;
    dnfCount: number;
    otherNonFinish: number;
  };
  const map = new Map<string, Agg>();
  for (const d of completed) {
    for (const r of (d.settings.results ?? []) as ResultRow[]) {
      const cat = resolveCat(r);
      const key = r.user_id ? `${r.user_id}|${r.car_class}` : `legacy|${r.car_class}|${cat}|${r.car_number}`;
      const cur =
        map.get(key) ??
        ({
          key,
          user_id: r.user_id,
          driver_name: r.driver_name,
          car_class: r.car_class,
          driver_category: cat,
          total: 0,
          dnsCount: 0,
          dnfCount: 0,
          otherNonFinish: 0,
        } as Agg);
      const ptsPen = Math.max(0, Number(r.penalty_points ?? 0));
      cur.total += Math.max(0, Number(r.points ?? 0) - ptsPen);
      const st = typeof r.status === "string" ? r.status : r.dns ? "dns" : null;
      if (st === "dns") cur.dnsCount += 1;
      else if (st === "dnf") cur.dnfCount += 1;
      else if (st === "nt" || st === "dsq") cur.otherNonFinish += 1;
      map.set(key, cur);
    }
  }
  const allRows = Array.from(map.values());

  const configs = Array.isArray(league.class_configs) ? (league.class_configs as any[]) : [];
  const groupKeys = configs.length
    ? configs.map((c) => `${c.car_class} · ${c.driver_category}`)
    : Array.from(new Set(allRows.map((r) => `${r.car_class} · ${r.driver_category}`)));

  const embeds: StandingsEmbed[] = [];
  for (const k of groupKeys) {
    const [cls, cat] = k.split(" · ");
    const rows = allRows
      .filter((r) => r.car_class === cls && r.driver_category === cat)
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (a.dnsCount !== b.dnsCount) return a.dnsCount - b.dnsCount;
        return a.dnfCount + a.otherNonFinish - (b.dnfCount + b.otherNonFinish);
      });
    if (rows.length === 0) continue;
    const lines = rows.map((r, i) => {
      const out = r.user_id && withdrawn.has(`${r.user_id}|${r.car_class}`) ? " *(udmeldt)*" : "";
      return `**${i + 1}.** ${r.driver_name}${out} — **${r.total}**`;
    });
    const parts = chunkLines(lines);
    parts.forEach((p, idx) => {
      embeds.push({
        title: `🏁 ${cls} ${cat}${parts.length > 1 ? ` (${idx + 1}/${parts.length})` : ""}`,
        description: p,
        color: COLOR,
      });
    });
  }

  // --- Holdstillinger ---
  const pointsPerPosition = Array.isArray((league.points_system as any)?.points_per_position)
    ? (league.points_system as any).points_per_position.map((n: any) => Number(n) || 0)
    : [];
  const teamInfos: LineupTeamInfo[] = [];
  for (const e of (teamEntries ?? []) as any[]) {
    const acceptedRows = ((e.league_team_lineup ?? []) as any[]).filter((l) => l.status === "accepted");
    if (acceptedRows.length < 2) continue;
    teamInfos.push({
      teamId: e.team_id,
      teamName: e.teams?.name ?? "Team",
      carClass: e.car_class,
      userIds: new Set(acceptedRows.map((l) => l.user_id as string)),
      effectiveFrom: new Map(acceptedRows.map((l) => [l.user_id as string, (l.effective_from as string | null) ?? null])),
      effectiveUntil: new Map(acceptedRows.map((l) => [l.user_id as string, (l.effective_until as string | null) ?? null])),
    });
  }
  const teamClasses = Array.from(new Set(teamInfos.map((t) => t.carClass)));
  // NB: samme team kan have tilmeldinger i flere klasser — nøglen skal derfor
  // indeholde både team-id og klasse, ellers overskriver den ene den anden.
  const totals = new Map<string, { name: string; cls: string; total: number; scored: boolean }>();
  for (const t of teamInfos) {
    totals.set(`${t.teamId}|${t.carClass}`, { name: t.teamName, cls: t.carClass, total: 0, scored: false });
  }
  for (const d of completed) {
    const ranked = computeTeamRacePoints({
      results: (d.settings?.results ?? []) as any[],
      teams: teamInfos,
      pointsPerPosition,
      raceDate: d.race_date ?? null,
    });
    for (const [cls, list] of ranked.entries()) {
      for (const t of list) {
        const agg = totals.get(`${t.teamId}|${cls}`);
        if (!agg) continue;
        agg.total += t.points;
        agg.scored = true;
      }
    }
  }
  for (const cls of teamClasses) {
    const list = Array.from(totals.values())
      .filter((t) => t.cls === cls && t.scored)
      .sort((a, b) => b.total - a.total);
    if (list.length === 0) continue;
    const lines = list.map((t, i) => `**${i + 1}.** ${t.name} — **${t.total}**`);
    const parts = chunkLines(lines);
    parts.forEach((p, idx) => {
      embeds.push({
        title: `👥 Teams — ${cls}${parts.length > 1 ? ` (${idx + 1}/${parts.length})` : ""}`,
        description: p,
        color: 0x0ea5e9,
      });
    });
  }

  return {
    leagueName: league.name as string,
    channelId: (league.standings_channel_id as string | null) ?? null,
    embeds,
  };
}
