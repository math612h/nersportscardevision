import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseLmuRaceFileServer } from "@/lib/lmu-parser-server";
import { normalizeCarClass, nameSimilarity } from "@/lib/lmu-parser";

const inputSchema = z.object({
  leagueId: z.string().uuid(),
  divisionId: z.string().uuid(),
  xml: z.string().min(50).max(5_000_000),
  round: z.number().int().min(1).max(99).optional(),
  sessionType: z.enum(["race", "qualifying"]).default("race"),
});

type Matched = {
  user_id: string;
  driver_name: string;
  car_class: string;
  car_model: string | null;
  best_lap_ms: number | null;
  finish_ms: number | null;
  finished: boolean;
  position: number | null;
  laps: number | null;
  car_number: number | null;
  driver_category: string | null;
};

async function matchDriversFromXml(
  xml: string,
  leagueId: string,
): Promise<{ matched: Matched[]; unmatched: string[]; track: string; layout: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: entries, error: eErr }, { data: allProfiles, error: pErr }] = await Promise.all([
    supabaseAdmin
      .from("entries")
      .select("user_id,driver_name,car_class,car_number,driver_category,waitlist")
      .eq("league_id", leagueId),
    supabaseAdmin.from("profiles").select("id, lmu_name").not("lmu_name", "is", null),
  ]);
  if (eErr) throw new Error(eErr.message);
  if (pErr) throw new Error(pErr.message);

  const validEntries = (entries ?? []).filter((e: any) => !e.waitlist);
  const entryUserIds = new Set(validEntries.map((e: any) => e.user_id as string));
  const normalizeDriverName = (name?: string | null) =>
    (name ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const entryByDriverAndClass = new Map<string, string>();
  for (const e of validEntries as any[]) {
    const key = `${normalizeDriverName(e.driver_name)}|${normalizeCarClass(e.car_class)}`;
    if (e.driver_name && e.user_id && !entryByDriverAndClass.has(key)) entryByDriverAndClass.set(key, e.user_id);
  }
  const entryByUserClass = new Map<string, { car_number: number | null; driver_category: string | null }>();
  for (const e of validEntries as any[]) {
    entryByUserClass.set(`${e.user_id}|${normalizeCarClass(e.car_class)}`, {
      car_number: (e as any).car_number ?? null,
      driver_category: (e as any).driver_category ?? null,
    });
  }

  const parsed = parseLmuRaceFileServer(xml);
  const matched: Matched[] = [];
  const unmatched: string[] = [];
  for (const d of parsed.drivers) {
    const dn = d.name.trim().toLowerCase();
    let matchId: string | null = null;
    const exact = (allProfiles ?? []).find((p) => (p.lmu_name ?? "").trim().toLowerCase() === dn);
    if (exact) matchId = exact.id;
    else {
      let best = 0;
      for (const p of allProfiles ?? []) {
        const s = nameSimilarity(d.name, p.lmu_name ?? "");
        if (s >= 0.85 && s > best) { best = s; matchId = p.id; }
      }
    }
    const normalizedClass = normalizeCarClass(d.carClass);
    if (!matchId || !entryUserIds.has(matchId)) {
      matchId = entryByDriverAndClass.get(`${normalizeDriverName(d.name)}|${normalizedClass}`) ?? null;
    }
    if (!matchId || !entryUserIds.has(matchId)) { unmatched.push(d.name); continue; }
    const ent = entryByUserClass.get(`${matchId}|${normalizedClass}`);
    matched.push({
      user_id: matchId,
      driver_name: d.name,
      car_class: normalizedClass,
      car_model: d.carModel,
      best_lap_ms: d.bestLapMs,
      finish_ms: d.finishMs,
      finished: d.finished,
      position: d.position,
      laps: d.laps,
      car_number: ent?.car_number ?? null,
      driver_category: ent?.driver_category ?? null,
    });
  }
  return { matched, unmatched, track: parsed.track, layout: parsed.layout };
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
    throw new Error("Kun admins kan håndtere liga-resultater.");
  }
}

// =============================================================
// Preview: parse XML + match drivers, NO writes.
// =============================================================
export const previewLeagueRaceResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { matched, unmatched, track, layout } = await matchDriversFromXml(data.xml, data.leagueId);
    return {
      track,
      layout,
      sessionType: data.sessionType,
      unmatched,
      rows: matched,
    };
  });

// =============================================================
// Publish: receives already-edited rows + penalties, writes results.
// Client is authoritative for positions/points (it recomputes live in UI).
// =============================================================
const publishRowSchema = z.object({
  user_id: z.string().uuid(),
  driver_name: z.string(),
  car_class: z.string(),
  car_model: z.string().nullable().optional(),
  car_number: z.number().int().nullable().optional(),
  driver_category: z.string().nullable().optional(),
  best_lap_ms: z.number().int().nullable().optional(),
  finish_ms: z.number().int().nullable().optional(),
  laps: z.number().int().nullable().optional(),
  position: z.number().int().min(1).max(999),
  points: z.number(),
  time_penalty_ms: z.number().int().min(0).default(0),
  position_penalty: z.number().int().min(0).default(0),
  points_penalty: z.number().min(0).default(0),
  dsq: z.boolean().default(false),
  dnf: z.boolean().default(false),
  fastest_lap: z.boolean().default(false),
});

const publishSchema = z.object({
  leagueId: z.string().uuid(),
  divisionId: z.string().uuid(),
  track: z.string(),
  layout: z.string().nullable().optional(),
  round: z.number().int().min(1).max(99).optional(),
  sessions: z.array(z.object({
    sessionType: z.enum(["race", "qualifying"]),
    rows: z.array(publishRowSchema),
  })).min(1),
});

export const publishLeagueRaceResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => publishSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: division, error: dErr } = await supabaseAdmin
      .from("divisions").select("id,league_id,settings").eq("id", data.divisionId).maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!division || division.league_id !== data.leagueId) throw new Error("Afdeling tilhører ikke ligaen.");

    for (const session of data.sessions) {
      // Replace existing rows
      const { error: delErr } = await supabaseAdmin
        .from("league_results")
        .delete()
        .eq("division_id", data.divisionId)
        .eq("session_type", session.sessionType);
      if (delErr) throw new Error(delErr.message);

      const rows = session.rows.map((r) => ({
        user_id: r.user_id,
        league_id: data.leagueId,
        division_id: data.divisionId,
        round: data.round ?? null,
        track: data.track,
        layout: data.layout ?? null,
        car_class: r.car_class,
        car_model: r.car_model ?? null,
        best_lap_ms: r.best_lap_ms ?? null,
        position: r.position,
        points: session.sessionType === "qualifying" ? 0 : r.points,
        session_type: session.sessionType,
        laps: r.laps ?? null,
        time_penalty_ms: r.time_penalty_ms ?? 0,
        position_penalty: r.position_penalty ?? 0,
        points_penalty: r.points_penalty ?? 0,
        dsq: r.dsq ?? false,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabaseAdmin.from("league_results").insert(rows);
        if (insErr) throw new Error(insErr.message);
      }
    }

    // Mirror race session into divisions.settings.results for forsiden
    const race = data.sessions.find((s) => s.sessionType === "race");
    if (race) {
      const settingsResults = race.rows.map((r) => ({
        driver_name: r.driver_name,
        user_id: r.user_id,
        car_class: r.car_class,
        car_model: r.car_model ?? null,
        car_number: r.car_number ?? null,
        driver_category: r.driver_category ?? null,
        class_position: r.position,
        position: r.position,
        best_lap_ms: r.best_lap_ms ?? null,
        laps: r.laps ?? null,
        points: r.points,
        fastest_lap: !!r.fastest_lap,
        penalty_seconds: Math.round((r.time_penalty_ms ?? 0) / 1000),
        penalty_points: r.points_penalty ?? 0,
        dns: false,
        dnf: !!r.dnf,
        dsq: !!r.dsq,
      }));
      const newSettings = {
        ...((division.settings as any) ?? {}),
        completed: true,
        results: settingsResults,
      };
      await supabaseAdmin.from("divisions").update({ settings: newSettings }).eq("id", data.divisionId);
    }

    return { ok: true };
  });

// =============================================================
// LEGACY: kept for backward compat. Same behaviour as før.
// =============================================================
export const uploadLeagueRaceResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: league, error: lErr }, { data: division, error: dErr }] = await Promise.all([
      supabaseAdmin.from("leagues").select("id,points_system").eq("id", data.leagueId).maybeSingle(),
      supabaseAdmin.from("divisions").select("id,league_id,track,layout,settings").eq("id", data.divisionId).maybeSingle(),
    ]);
    if (lErr) throw new Error(lErr.message);
    if (dErr) throw new Error(dErr.message);
    if (!league) throw new Error("Liga findes ikke.");
    if (!division || division.league_id !== data.leagueId) throw new Error("Afdeling tilhører ikke ligaen.");

    const { matched, unmatched, track, layout } = await matchDriversFromXml(data.xml, data.leagueId);
    if (matched.length === 0) {
      return { inserted: 0, leaderboard_inserted: 0, unmatched, note: "Ingen kørere matchede profiler." };
    }

    const pointsTable: number[] = Array.isArray((league.points_system as any)?.points_per_position)
      ? (league.points_system as any).points_per_position : [];
    const minFinishPct = Math.max(0, Math.min(100, Number((league.points_system as any)?.min_finish_percent ?? 0))) / 100;

    const byClass = new Map<string, Matched[]>();
    for (const m of matched) {
      if (!byClass.has(m.car_class)) byClass.set(m.car_class, []);
      byClass.get(m.car_class)!.push(m);
    }
    const dnfFlag = new Map<Matched, boolean>();
    if (minFinishPct > 0 && data.sessionType === "race") {
      for (const [, arr] of byClass) {
        const maxLaps = arr.reduce((mx, d) => Math.max(mx, d.laps ?? 0), 0);
        if (maxLaps <= 0) continue;
        const threshold = minFinishPct * maxLaps;
        for (const d of arr) if ((d.laps ?? 0) < threshold) dnfFlag.set(d, true);
      }
    }
    const resultRows: any[] = [];
    for (const [carClass, arr] of byClass) {
      const allHavePos = arr.every((d) => d.position != null);
      let ordered: typeof arr;
      if (allHavePos) ordered = [...arr].sort((a, b) => (a.position! - b.position!));
      else if (data.sessionType === "qualifying") {
        // Quali: sortér udelukkende efter hurtigste omgang. Antal omgange og
        // finish-status er irrelevant — det handler kun om bedste tid.
        ordered = [...arr].sort((a, b) =>
          (a.best_lap_ms ?? Number.MAX_SAFE_INTEGER) - (b.best_lap_ms ?? Number.MAX_SAFE_INTEGER),
        );
      } else {
        const finished = arr.filter((d) => d.finished && d.finish_ms != null)
          .sort((a, b) => ((b.laps ?? 0) - (a.laps ?? 0)) || ((a.finish_ms ?? Number.MAX_SAFE_INTEGER) - (b.finish_ms ?? Number.MAX_SAFE_INTEGER)));
        const unfinished = arr.filter((d) => !(d.finished && d.finish_ms != null))
          .sort((a, b) => ((b.laps ?? 0) - (a.laps ?? 0)) || ((a.best_lap_ms ?? Number.MAX_SAFE_INTEGER) - (b.best_lap_ms ?? Number.MAX_SAFE_INTEGER)));
        ordered = [...finished, ...unfinished];
      }
      const nonDnf = ordered.filter((d) => !dnfFlag.get(d));
      const dnfs = ordered.filter((d) => dnfFlag.get(d));
      ordered = [...nonDnf, ...dnfs];
      ordered.forEach((d, idx) => {
        const position = idx + 1;
        const isDnf = !!dnfFlag.get(d);
        const points = isDnf ? 0 : (pointsTable[idx] ?? 0);
        resultRows.push({
          user_id: d.user_id, league_id: data.leagueId, division_id: data.divisionId,
          round: data.round ?? null, track, layout, car_class: carClass, car_model: d.car_model,
          best_lap_ms: d.best_lap_ms, position, points: data.sessionType === "qualifying" ? 0 : points,
          session_type: data.sessionType, laps: d.laps, _dnf: isDnf,
        });
      });
    }

    const { error: delErr } = await supabaseAdmin
      .from("league_results").delete()
      .eq("division_id", data.divisionId).eq("session_type", data.sessionType);
    if (delErr) throw new Error(delErr.message);
    const dbRows = resultRows.map(({ _dnf, ...rest }) => rest);
    const { error: insErr } = await supabaseAdmin.from("league_results").insert(dbRows);
    if (insErr) throw new Error(insErr.message);

    if (data.sessionType === "race") {
      const raceRows = resultRows.filter((r) => r.session_type === "race");
      const driverNameById = new Map<string, string>();
      for (const m of matched) driverNameById.set(m.user_id, m.driver_name);
      const settingsResults = raceRows.map((r) => {
        const ent = matched.find((m) => m.user_id === r.user_id && m.car_class === r.car_class);
        return {
          driver_name: driverNameById.get(r.user_id) ?? "",
          user_id: r.user_id, car_class: r.car_class, car_model: r.car_model,
          car_number: ent?.car_number ?? null, driver_category: ent?.driver_category ?? null,
          class_position: r.position, position: r.position, best_lap_ms: r.best_lap_ms,
          laps: r.laps, points: r.points, dns: false, dnf: !!r._dnf,
        };
      });
      const newSettings = { ...(division.settings as any ?? {}), completed: true, results: settingsResults };
      await supabaseAdmin.from("divisions").update({ settings: newSettings }).eq("id", data.divisionId);
    }
    return { inserted: resultRows.length, leaderboard_inserted: 0, unmatched, track, layout };
  });

// Slet gemte resultater for en afdeling. Bruges når admins vil starte forfra
// på en afdeling. Kan afgrænses til én session (race/qualifying) eller begge.
const deleteSchema = z.object({
  leagueId: z.string().uuid(),
  divisionId: z.string().uuid(),
  sessionType: z.enum(["race", "qualifying", "both"]).default("both"),
  clearDivisionSettings: z.boolean().default(true),
});

export const deleteLeagueRaceResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: division, error: dErr } = await supabaseAdmin
      .from("divisions").select("id,league_id,settings").eq("id", data.divisionId).maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!division || division.league_id !== data.leagueId) throw new Error("Afdeling tilhører ikke ligaen.");

    let q = supabaseAdmin.from("league_results").delete({ count: "exact" }).eq("division_id", data.divisionId);
    if (data.sessionType !== "both") q = q.eq("session_type", data.sessionType);
    const { error: delErr, count } = await q;
    if (delErr) throw new Error(delErr.message);

    if (data.clearDivisionSettings && data.sessionType !== "qualifying") {
      const currentSettings = (division.settings as any) ?? {};
      const newSettings = { ...currentSettings, completed: false, results: [] };
      const { error: uErr } = await supabaseAdmin
        .from("divisions").update({ settings: newSettings }).eq("id", data.divisionId);
      if (uErr) throw new Error(uErr.message);
    }

    return { deleted: count ?? 0 };
  });

