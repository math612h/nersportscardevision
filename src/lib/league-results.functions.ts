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

export const uploadLeagueRaceResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Admin check
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
      throw new Error("Kun admins kan uploade liga-resultater.");
    }

    // Load league + division + entries (only registered league participants count)
    const [{ data: league, error: lErr }, { data: division, error: dErr }, { data: entries, error: eErr }] = await Promise.all([
      supabaseAdmin.from("leagues").select("id,points_system").eq("id", data.leagueId).maybeSingle(),
      supabaseAdmin.from("divisions").select("id,league_id,track,layout,settings").eq("id", data.divisionId).maybeSingle(),
      supabaseAdmin.from("entries").select("user_id,car_class,waitlist").eq("league_id", data.leagueId),
    ]);
    if (lErr) throw new Error(lErr.message);
    if (dErr) throw new Error(dErr.message);
    if (eErr) throw new Error(eErr.message);
    if (!league) throw new Error("Liga findes ikke.");
    if (!division || division.league_id !== data.leagueId) throw new Error("Afdeling tilhører ikke ligaen.");

    const entryUserIds = new Set(
      (entries ?? []).filter((e: any) => !e.waitlist).map((e: any) => e.user_id as string)
    );

    // Parse XML
    let parsed;
    try {
      parsed = parseLmuRaceFileServer(data.xml);
    } catch (e: any) {
      throw new Error(e?.message ?? "Kunne ikke læse XML-filen.");
    }

    // Match drivers to profiles
    const { data: allProfiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, lmu_name")
      .not("lmu_name", "is", null);
    if (pErr) throw new Error(pErr.message);

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
    };

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
      if (!matchId || !entryUserIds.has(matchId)) { unmatched.push(d.name); continue; }
      matched.push({
        user_id: matchId,
        driver_name: d.name,
        car_class: normalizeCarClass(d.carClass),
        car_model: d.carModel,
        best_lap_ms: d.bestLapMs,
        finish_ms: d.finishMs,
        finished: d.finished,
        position: d.position,
        laps: d.laps,
      });
    }

    if (matched.length === 0) {
      return { inserted: 0, leaderboard_inserted: 0, unmatched, note: "Ingen kørere matchede profiler." };
    }

    // Group by car_class and rank: finished drivers by finish_ms asc, then unfinished by best_lap_ms
    const pointsTable: number[] = Array.isArray((league.points_system as any)?.points_per_position)
      ? (league.points_system as any).points_per_position
      : [];

    const byClass = new Map<string, Matched[]>();
    for (const m of matched) {
      if (!byClass.has(m.car_class)) byClass.set(m.car_class, []);
      byClass.get(m.car_class)!.push(m);
    }

    const resultRows: any[] = [];
    for (const [carClass, arr] of byClass) {
      // If XML provides explicit Position for every driver in class, trust it.
      const allHavePos = arr.every((d) => d.position != null);
      let ordered: typeof arr;
      if (allHavePos) {
        ordered = [...arr].sort((a, b) => (a.position! - b.position!));
      } else {
        // Fallback: rank by laps desc, then finish time asc, then best lap asc.
        const finished = arr.filter((d) => d.finished && d.finish_ms != null)
          .sort((a, b) =>
            ((b.laps ?? 0) - (a.laps ?? 0)) ||
            ((a.finish_ms ?? Number.MAX_SAFE_INTEGER) - (b.finish_ms ?? Number.MAX_SAFE_INTEGER))
          );
        const unfinished = arr.filter((d) => !(d.finished && d.finish_ms != null))
          .sort((a, b) =>
            ((b.laps ?? 0) - (a.laps ?? 0)) ||
            ((a.best_lap_ms ?? Number.MAX_SAFE_INTEGER) - (b.best_lap_ms ?? Number.MAX_SAFE_INTEGER))
          );
        ordered = [...finished, ...unfinished];
      }
      ordered.forEach((d, idx) => {
        const position = idx + 1;
        const points = pointsTable[idx] ?? 0;
        resultRows.push({
          user_id: d.user_id,
          league_id: data.leagueId,
          division_id: data.divisionId,
          round: data.round ?? null,
          track: parsed.track,
          layout: parsed.layout,
          car_class: carClass,
          car_model: d.car_model,
          best_lap_ms: d.best_lap_ms,
          position,
          points: data.sessionType === "qualifying" ? 0 : points,
          session_type: data.sessionType,
        });
      });
    }

    // Replace existing results for this division+session_type (idempotent re-upload)
    const { error: delErr } = await supabaseAdmin
      .from("league_results")
      .delete()
      .eq("division_id", data.divisionId)
      .eq("session_type", data.sessionType);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await supabaseAdmin.from("league_results").insert(resultRows);
    if (insErr) throw new Error(insErr.message);

    // Leaderboard upload removed for league results to avoid unique constraint
    // conflicts when re-uploading or uploading both race + quali for an event.
    const lbInserted = 0;


    // Mark division as completed when race file uploaded + populate settings.results
    // (so the front page "Seneste løb" card can render top-3 per class).
    if (data.sessionType === "race") {
      const raceRows = resultRows.filter((r) => r.session_type === "race");
      const driverNameById = new Map<string, string>();
      for (const m of matched) driverNameById.set(m.user_id, m.driver_name);

      // Lookup car_number + driver_category from entries for this league so the
      // standings (especially team standings) can group rows correctly.
      const userIds = Array.from(new Set(raceRows.map((r) => r.user_id)));
      const { data: leagueEntries } = await supabaseAdmin
        .from("entries")
        .select("user_id,car_class,car_number,driver_category")
        .eq("league_id", data.leagueId)
        .in("user_id", userIds);
      const entryByKey = new Map<string, { car_number: number | null; driver_category: string | null }>();
      for (const e of leagueEntries ?? []) {
        entryByKey.set(`${e.user_id}|${e.car_class}`, {
          car_number: (e as any).car_number ?? null,
          driver_category: (e as any).driver_category ?? null,
        });
      }

      const settingsResults = raceRows.map((r) => {
        const ent = entryByKey.get(`${r.user_id}|${r.car_class}`);
        return {
          driver_name: driverNameById.get(r.user_id) ?? "",
          user_id: r.user_id,
          car_class: r.car_class,
          car_model: r.car_model,
          car_number: ent?.car_number ?? null,
          driver_category: ent?.driver_category ?? null,
          class_position: r.position,
          position: r.position,
          best_lap_ms: r.best_lap_ms,
          points: r.points,
          dns: false,
          dnf: false,
        };
      });
      const newSettings = {
        ...(division.settings as any ?? {}),
        completed: true,
        results: settingsResults,
      };
      await supabaseAdmin.from("divisions").update({ settings: newSettings }).eq("id", data.divisionId);
    }

    return {
      inserted: resultRows.length,
      leaderboard_inserted: lbInserted,
      unmatched,
      track: parsed.track,
      layout: parsed.layout,
    };
  });
