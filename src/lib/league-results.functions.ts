import { createServerFn } from "@tanstack/react-start";
import { raceStatusFor } from "@/lib/result-status";
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

type StoredRaceRow = Record<string, unknown> & {
  user_id?: string;
  car_class?: string;
  driver_category?: string;
  class_position?: number;
  source_position?: number | null;
  finish_time_ms?: number;
  effective_ms?: number;
  laps?: number | null;
  points?: number;
  penalty_seconds?: number;
  penalty_points?: number;
  dns?: boolean;
  dnf?: boolean;
  dsq?: boolean;
  finished?: boolean;
  status?: string | null;
};

function recalculateStoredRaceRows(
  source: StoredRaceRow[],
  pointsTable: number[],
  minFinishPercent: number,
  currentCategoryByUserClass: Map<string, string>,
) {
  const rows = source.map((row) => {
    const category = row.user_id && row.car_class
      ? currentCategoryByUserClass.get(`${row.user_id}|${row.car_class}`)
      : undefined;
    const finishMs = Number(row.finish_time_ms ?? 0);
    const penaltySeconds = Math.max(0, Number(row.penalty_seconds ?? 0));
    return {
      ...row,
      ...(category ? { driver_category: category } : {}),
      effective_ms: finishMs > 0 && !row.dnf && !row.dns
        ? finishMs + penaltySeconds * 1000
        : 0,
      class_position: 0,
      points: 0,
      finished: row.finished ?? (finishMs > 0 && !row.dnf && !row.dns),
      status: row.status ?? null,
    };
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.car_class ?? ""}|${row.driver_category ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const active = group.filter((row) =>
      !row.dns && (
        Number(row.source_position ?? 0) > 0 ||
        Number(row.effective_ms ?? 0) > 0 ||
        Number(row.laps ?? 0) > 0
      ),
    );
    active.sort((a, b) => {
      const laps = Number(b.laps ?? 0) - Number(a.laps ?? 0);
      if (laps !== 0) return laps;
      const aTime = Number(a.effective_ms ?? 0);
      const bTime = Number(b.effective_ms ?? 0);
      if (aTime > 0 && bTime > 0) return aTime - bTime;
      if (aTime > 0) return -1;
      if (bTime > 0) return 1;
      return Number(a.source_position ?? Number.MAX_SAFE_INTEGER) - Number(b.source_position ?? Number.MAX_SAFE_INTEGER);
    });

    const maxLaps = Math.max(0, ...active.map((row) => Number(row.laps ?? 0)));
    const minLaps = minFinishPercent > 0 && maxLaps > 0
      ? Math.ceil(maxLaps * minFinishPercent / 100)
      : 0;
    const eligible = active.filter((row) =>
      !row.dsq && (minLaps === 0 || Number(row.laps ?? 0) >= minLaps),
    );
    for (const row of group) {
      row.status = raceStatusFor(
        { dns: row.dns, dnf: row.dnf, dsq: row.dsq, laps: row.laps, finished: row.finished },
        minLaps,
      );
    }
    eligible.forEach((row, index) => {
      row.class_position = index + 1;
      // Gem BRUTTO-point. Straffepoint trækkes fra i visningerne, så de aldrig
      // bliver trukket to gange.
      row.points = Math.max(0, Number(pointsTable[index] ?? 0));
    });

  }

  return rows;
}

async function syncStoredRaceRowsToLeagueResults(
  supabaseAdmin: any,
  divisionId: string,
  rows: StoredRaceRow[],
) {
  for (const row of rows) {
    if (!row.user_id || !row.car_class || Number(row.class_position ?? 0) <= 0) continue;
    const { error } = await supabaseAdmin
      .from("league_results")
      .update({
        position: Number(row.class_position),
        points: Number(row.points ?? 0),
        time_penalty_ms: Math.round(Math.max(0, Number(row.penalty_seconds ?? 0)) * 1000),
        points_penalty: Math.max(0, Number(row.penalty_points ?? 0)),
        dsq: !!row.dsq,
        status: row.status ?? null,
      })
      .eq("division_id", divisionId)
      .eq("session_type", "race")
      .eq("user_id", row.user_id)
      .eq("car_class", row.car_class);
    if (error) throw new Error(error.message);
  }
}

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
        fastest_lap: false,
        penalty_seconds: Math.round((r.time_penalty_ms ?? 0) / 1000),
        penalty_points: r.points_penalty ?? 0,
        dns: false,
        dnf: !!r.dnf,
        dsq: !!r.dsq,
        finished: !r.dnf && !r.dsq,
        status: r.dsq ? "dsq" : r.dnf ? "ret" : "classified",
      }));
      const prev = ((division.settings as any) ?? {});
      const newSettings = {
        ...prev,
        completed: true,
        completed_at: prev.completed && prev.completed_at ? prev.completed_at : new Date().toISOString(),
        results_confirmed: false,
        results_confirmed_at: null,
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

    // Gruppér pr. bilklasse + kategori, så fx LMGT3 Pro og LMGT3 Am hver
    // måles mod deres egen klasses vinder (ikke hinanden eller LMP2).
    const groupKeyOf = (m: Matched) => `${m.car_class}|${m.driver_category ?? ""}`;
    const byClass = new Map<string, Matched[]>();
    for (const m of matched) {
      const k = groupKeyOf(m);
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k)!.push(m);
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
    for (const [groupKey, arr] of byClass) {
      const carClass = arr[0]?.car_class ?? groupKey.split("|")[0];
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
          finished: !r._dnf,
          status: r._dnf ? "dnf" : "classified",
        };
      });
      const prevSettings = ((division.settings as any) ?? {});
      const newSettings = {
        ...prevSettings,
        completed: true,
        completed_at: prevSettings.completed && prevSettings.completed_at ? prevSettings.completed_at : new Date().toISOString(),
        results_confirmed: false,
        results_confirmed_at: null,
        results: settingsResults,
      };
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

// =============================================================
// Genberegn point for hele ligaen ud fra ligaens aktuelle pointtabel.
// Opdaterer BÅDE league_results og afdelingernes kopi i settings.results,
// så de to aldrig kommer ud af sync.
// =============================================================
const recalcSchema = z.object({ leagueId: z.string().uuid() });

export const recalcLeaguePoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => recalcSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: league, error: lErr } = await supabaseAdmin
      .from("leagues").select("id,points_system").eq("id", data.leagueId).maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!league) throw new Error("Liga findes ikke.");
    const table: number[] = Array.isArray((league.points_system as any)?.points_per_position)
      ? (league.points_system as any).points_per_position.map((n: any) => Number(n) || 0)
      : [];

    const { data: divisions, error: dErr } = await supabaseAdmin
      .from("divisions").select("id,settings").eq("league_id", data.leagueId);
    if (dErr) throw new Error(dErr.message);

    let updatedRows = 0;
    for (const div of divisions ?? []) {
      const settings = ((div.settings as any) ?? {});
      const copy: StoredRaceRow[] = Array.isArray(settings.results) ? settings.results : [];
      if (copy.length === 0) continue;
      const { data: entries, error: eErr } = await supabaseAdmin
        .from("entries")
        .select("user_id,car_class,driver_category")
        .eq("league_id", data.leagueId)
        .is("division_id", null);
      if (eErr) throw new Error(eErr.message);
      const categoryMap = new Map<string, string>();
      for (const entry of entries ?? []) {
        if (entry.driver_category) categoryMap.set(`${entry.user_id}|${entry.car_class}`, entry.driver_category);
      }
      const next = recalculateStoredRaceRows(
        copy,
        table,
        Math.max(0, Math.min(100, Number((league.points_system as any)?.min_finish_percent ?? 0))),
        categoryMap,
      );
      updatedRows += next.filter((row, index) =>
        Number(row.class_position ?? 0) !== Number(copy[index]?.class_position ?? 0) ||
        Number(row.points ?? 0) !== Number(copy[index]?.points ?? 0) ||
        row.driver_category !== copy[index]?.driver_category,
      ).length;
      const { error: settingsError } = await supabaseAdmin
        .from("divisions")
        .update({ settings: { ...settings, results: next } })
        .eq("id", div.id);
      if (settingsError) throw new Error(settingsError.message);
      await syncStoredRaceRowsToLeagueResults(supabaseAdmin, div.id, next);
    }

    return { updatedRows };
  });

const protestRulingSchema = z.object({
  protestId: z.string().uuid(),
  outcome: z.enum(["no_penalty", "warning", "time_penalty", "point_penalty", "disqualified"]),
  reason: z.string().trim().min(1).max(2000),
  seconds: z.number().min(0).default(0),
  points: z.number().min(0).default(0),
  penalizedUserIds: z.array(z.string().uuid()),
});

type AppliedPenalty = { seconds?: number; points?: number; dsq?: boolean };

export const applyProtestRuling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => protestRulingSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: protest, error: protestError } = await supabaseAdmin
      .from("protests")
      .select("id,division_id,verdict_details,divisions(id,league_id,settings,leagues(points_system))")
      .eq("id", data.protestId)
      .maybeSingle();
    if (protestError) throw new Error(protestError.message);
    const division = (protest as any)?.divisions;
    if (!protest || !division) throw new Error("Protesten eller afdelingen findes ikke.");

    const needsTargets = ["warning", "time_penalty", "point_penalty", "disqualified"].includes(data.outcome);
    if (needsTargets && data.penalizedUserIds.length === 0) throw new Error("Vælg mindst én kører.");
    if (data.outcome === "time_penalty" && data.seconds <= 0) throw new Error("Angiv antal sekunder.");
    if (data.outcome === "point_penalty" && data.points <= 0) throw new Error("Angiv antal point.");

    const previous = (((protest as any).verdict_details ?? {}).applied_penalties ?? {}) as Record<string, AppliedPenalty>;
    const nextApplied: Record<string, AppliedPenalty> = {};
    for (const userId of data.penalizedUserIds) {
      if (data.outcome === "time_penalty") nextApplied[userId] = { seconds: data.seconds };
      else if (data.outcome === "point_penalty") nextApplied[userId] = { points: data.points };
      else if (data.outcome === "disqualified") nextApplied[userId] = { dsq: true };
    }

    const settings = (division.settings ?? {}) as Record<string, unknown>;
    const source: StoredRaceRow[] = Array.isArray(settings.results) ? settings.results : [];
    const affected = new Set([...Object.keys(previous), ...Object.keys(nextApplied)]);
    const adjusted = source.map((row) => {
      if (!row.user_id || !affected.has(row.user_id)) return row;
      const oldPenalty = previous[row.user_id] ?? {};
      const newPenalty = nextApplied[row.user_id] ?? {};
      return {
        ...row,
        penalty_seconds: Math.max(0, Number(row.penalty_seconds ?? 0) - Number(oldPenalty.seconds ?? 0) + Number(newPenalty.seconds ?? 0)),
        penalty_points: Math.max(0, Number(row.penalty_points ?? 0) - Number(oldPenalty.points ?? 0) + Number(newPenalty.points ?? 0)),
        dsq: oldPenalty.dsq ? !!newPenalty.dsq : (!!row.dsq || !!newPenalty.dsq),
      };
    });

    const [{ data: entries, error: entriesError }] = await Promise.all([
      supabaseAdmin.from("entries").select("user_id,car_class,driver_category").eq("league_id", division.league_id).is("division_id", null),
    ]);
    if (entriesError) throw new Error(entriesError.message);
    const categoryMap = new Map<string, string>();
    for (const entry of entries ?? []) {
      if (entry.driver_category) categoryMap.set(`${entry.user_id}|${entry.car_class}`, entry.driver_category);
    }
    const pointsSystem = (division.leagues?.points_system ?? {}) as any;
    const pointsTable = Array.isArray(pointsSystem.points_per_position)
      ? pointsSystem.points_per_position.map((value: unknown) => Number(value) || 0)
      : [];
    const recalculated = recalculateStoredRaceRows(
      adjusted,
      pointsTable,
      Math.max(0, Math.min(100, Number(pointsSystem.min_finish_percent ?? 0))),
      categoryMap,
    );

    const details: Record<string, unknown> = {
      penalized_user_ids: data.penalizedUserIds,
      applied_penalties: nextApplied,
    };
    if (data.outcome === "time_penalty") details.seconds = data.seconds;
    if (data.outcome === "point_penalty") details.points = data.points;

    const { error: divisionError } = await supabaseAdmin
      .from("divisions")
      .update({ settings: { ...settings, results: recalculated, results_confirmed: false, results_confirmed_at: null } })
      .eq("id", division.id);
    if (divisionError) throw new Error(divisionError.message);
    await syncStoredRaceRowsToLeagueResults(supabaseAdmin, division.id, recalculated);

    const { error: rulingError } = await supabaseAdmin
      .from("protests")
      .update({
        status: "ruled",
        verdict_outcome: data.outcome,
        verdict_reason: data.reason,
        verdict_details: details as any,
        ruled_by: context.userId,
        ruled_at: new Date().toISOString(),
      })
      .eq("id", data.protestId);
    if (rulingError) throw new Error(rulingError.message);
    return { ok: true };
  });


// =============================================================
// Bekræft / afbekræft resultater for en afdeling.
// "Bekræftet" betyder at resultaterne er endelige (straffe tilføjet).
// =============================================================
const confirmSchema = z.object({
  leagueId: z.string().uuid(),
  divisionId: z.string().uuid(),
  confirmed: z.boolean(),
});

export const setResultsConfirmed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => confirmSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: division, error: dErr } = await supabaseAdmin
      .from("divisions").select("id,league_id,settings").eq("id", data.divisionId).maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!division || division.league_id !== data.leagueId) throw new Error("Afdeling tilhører ikke ligaen.");

    const prev = ((division.settings as any) ?? {});
    const newSettings = {
      ...prev,
      results_confirmed: data.confirmed,
      results_confirmed_at: data.confirmed ? new Date().toISOString() : null,
      results_confirmed_by: data.confirmed ? context.userId : null,
    };
    const { error: uErr } = await supabaseAdmin
      .from("divisions").update({ settings: newSettings }).eq("id", data.divisionId);
    if (uErr) throw new Error(uErr.message);
    return { confirmed: data.confirmed };
  });

// =============================================================
// Udgiv / skjul resultater for en afdeling.
// "Udgivet" betyder at resultaterne er synlige for brugerne (men endnu
// ikke nødvendigvis bekræftede/endelige).
// =============================================================
const publishVisibilitySchema = z.object({
  leagueId: z.string().uuid(),
  divisionId: z.string().uuid(),
  published: z.boolean(),
});

export const setResultsPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => publishVisibilitySchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: division, error: dErr } = await supabaseAdmin
      .from("divisions").select("id,league_id,settings").eq("id", data.divisionId).maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!division || division.league_id !== data.leagueId) throw new Error("Afdeling tilhører ikke ligaen.");

    const prev = ((division.settings as any) ?? {});
    const newSettings = {
      ...prev,
      results_published: data.published,
      results_published_at: data.published ? new Date().toISOString() : null,
      results_published_by: data.published ? context.userId : null,
      ...(data.published ? {} : { results_confirmed: false, results_confirmed_at: null }),
    };
    const { error: uErr } = await supabaseAdmin
      .from("divisions").update({ settings: newSettings }).eq("id", data.divisionId);
    if (uErr) throw new Error(uErr.message);
    return { published: data.published };
  });

