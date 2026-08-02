// Kontrolleret genberegning af leaderboard-poster der stammer fra ÉN konkret
// LMU-resultatfil. Bruges til at rette gamle endurance-imports, hvor bilens
// samlede bedste omgang fejlagtigt blev tilskrevet den sidste kører.
//
// Sikker kobling mellem fil og poster:
//   leaderboard_times.recorded_at == <SessionTime i filen>  (unikt tidsstempel)
//   AND track == filens bane  AND layout == filens layout
// Kun poster i dette snit røres. Alle andre tider — også fra andre filer på
// samme bane — er urørte, og den normale "kun forbedringer"-regel ved upload
// ændres ikke.

import { parseLmuRaceFileServer } from "@/lib/lmu-parser-server";
import { expandDriverStints, normalizeCarClass, nameSimilarity, type ParsedRace } from "@/lib/lmu-parser";

export type RepairChange = {
  action: "update" | "insert" | "delete" | "unchanged";
  rowId: string | null;
  userId: string | null;
  carClass: string;
  before: { driverName: string; bestLapMs: number } | null;
  after: { driverName: string; bestLapMs: number; lapNum: number | null } | null;
  reason: string;
};

export type RepairReport = {
  applied: boolean;
  file: { track: string; layout: string | null; recordedAt: string; gameVersion: string | null };
  scopedRows: number;
  changes: RepairChange[];
};

type ProfileRow = { id: string; lmu_name: string | null };

function matchProfile(name: string, profiles: ProfileRow[]): string | null {
  const dn = name.trim().toLowerCase();
  const exact = profiles.find((p) => (p.lmu_name ?? "").trim().toLowerCase() === dn);
  if (exact) return exact.id;
  let best = 0;
  let id: string | null = null;
  for (const p of profiles) {
    const s = nameSimilarity(name, p.lmu_name ?? "");
    if (s >= 0.85 && s > best) { best = s; id = p.id; }
  }
  return id;
}

export async function recomputeFromResultFile(xml: string, apply: boolean): Promise<RepairReport> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const raw: ParsedRace = parseLmuRaceFileServer(xml);
  if (!raw.recordedAt) {
    throw new Error("Filen mangler tidsstempel (SessionTime) — kan ikke kobles sikkert til eksisterende poster.");
  }
  const parsed = { ...raw, drivers: expandDriverStints(raw.drivers) };

  // 1) Poster der dokumenterbart stammer fra netop denne fil
  let q = supabaseAdmin
    .from("leaderboard_times")
    .select("id,user_id,driver_name,track,layout,car_class,car_model,best_lap_ms,source,uploaded_by,recorded_at,game_version")
    .eq("recorded_at", parsed.recordedAt)
    .eq("track", parsed.track);
  q = parsed.layout === null ? q.is("layout", null) : q.eq("layout", parsed.layout);
  const { data: scoped, error: sErr } = await q;
  if (sErr) throw new Error(sErr.message);
  const rows = scoped ?? [];

  const { data: profs, error: pErr } = await supabaseAdmin
    .from("profiles").select("id,lmu_name").not("lmu_name", "is", null);
  if (pErr) throw new Error(pErr.message);
  const profiles = (profs ?? []) as ProfileRow[];

  // 2) Genberegn med den nye stint-logik
  type Expected = { userId: string; name: string; ms: number; lapNum: number | null; carClass: string; carModel: string | null };
  const expected = new Map<string, Expected>();
  for (const d of parsed.drivers) {
    if (d.bestLapMs == null) continue;
    const userId = matchProfile(d.name, profiles);
    if (!userId) continue;
    const carClass = normalizeCarClass(d.carClass);
    const key = `${userId}|${carClass}`;
    const prev = expected.get(key);
    if (!prev || d.bestLapMs < prev.ms) {
      expected.set(key, {
        userId, name: d.name, ms: d.bestLapMs, lapNum: d.bestLapNum ?? null,
        carClass, carModel: d.carModel,
      });
    }
  }

  const changes: RepairChange[] = [];
  const seen = new Set<string>();

  // 3) Opdater/fjern kun poster fra denne fil
  for (const r of rows) {
    const key = `${r.user_id}|${r.car_class}`;
    const exp = expected.get(key);
    if (!exp) {
      changes.push({
        action: "delete", rowId: r.id, userId: r.user_id, carClass: r.car_class,
        before: { driverName: r.driver_name, bestLapMs: r.best_lap_ms }, after: null,
        reason: "Køreren har ingen gyldig egen omgang i filen efter stint-opdeling",
      });
      if (apply) {
        const { error } = await supabaseAdmin.from("leaderboard_times").delete().eq("id", r.id);
        if (error) throw new Error(error.message);
      }
      continue;
    }
    seen.add(key);
    if (exp.ms !== r.best_lap_ms || exp.name.trim() !== r.driver_name.trim()) {
      changes.push({
        action: "update", rowId: r.id, userId: r.user_id, carClass: r.car_class,
        before: { driverName: r.driver_name, bestLapMs: r.best_lap_ms },
        after: { driverName: exp.name, bestLapMs: exp.ms, lapNum: exp.lapNum },
        reason: "Genberegnet fra <Swap>-stints i den oprindelige resultatfil",
      });
      if (apply) {
        const { error } = await supabaseAdmin
          .from("leaderboard_times")
          .update({ driver_name: exp.name, best_lap_ms: exp.ms, car_model: exp.carModel })
          .eq("id", r.id);
        if (error) throw new Error(error.message);
      }
    } else {
      changes.push({
        action: "unchanged", rowId: r.id, userId: r.user_id, carClass: r.car_class,
        before: { driverName: r.driver_name, bestLapMs: r.best_lap_ms },
        after: { driverName: exp.name, bestLapMs: exp.ms, lapNum: exp.lapNum },
        reason: "Allerede korrekt",
      });
    }
  }

  // 4) Manglende kørere fra samme fil tilføjes (samme recorded_at ⇒ ingen
  //    "hurtigere tid"-regel omgås, det er filens egne tider)
  for (const [key, exp] of expected) {
    if (seen.has(key)) continue;
    changes.push({
      action: "insert", rowId: null, userId: exp.userId, carClass: exp.carClass,
      before: null, after: { driverName: exp.name, bestLapMs: exp.ms, lapNum: exp.lapNum },
      reason: "Kører manglede fra denne resultatfil (endurance-stint)",
    });
    if (apply) {
      const { error } = await supabaseAdmin.from("leaderboard_times").upsert([{
        user_id: exp.userId,
        driver_name: exp.name,
        track: parsed.track,
        layout: parsed.layout,
        car_class: exp.carClass,
        car_model: exp.carModel,
        best_lap_ms: exp.ms,
        source: "user" as const,
        uploaded_by: rows[0]?.uploaded_by ?? exp.userId,
        recorded_at: parsed.recordedAt,
        game_version: parsed.gameVersion,
      }], { onConflict: "user_id,track,layout,car_class,recorded_at", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
  }

  console.info("[leaderboard-repair]", JSON.stringify({ apply, recordedAt: parsed.recordedAt, track: parsed.track, changes }));

  return {
    applied: apply,
    file: { track: parsed.track, layout: parsed.layout, recordedAt: parsed.recordedAt, gameVersion: parsed.gameVersion },
    scopedRows: rows.length,
    changes,
  };
}
