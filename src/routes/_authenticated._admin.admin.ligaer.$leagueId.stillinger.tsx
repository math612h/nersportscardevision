import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Save, Zap, Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ClassConfig } from "@/lib/tracks";
import { parseLmuRaceFile, normalizeCarClass, findBestNameMatch } from "@/lib/lmu-parser";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer/$leagueId/stillinger")({
  component: AdminStandings,
});

const DEFAULT_POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

type DraftRow = {
  entry_id: string;
  user_id: string;
  car_number: number;
  driver_name: string;
  car_class: string;
  driver_category: string;
  time_str: string;
  penalty_seconds: number;
  penalty_points: number;
  fastest_lap: boolean;
  dnf: boolean;
  dns: boolean;
};

type EntryRec = {
  id: string;
  user_id: string;
  driver_name: string;
  car_class: string;
  driver_category: string;
  car_number: number;
  waitlist: boolean;
  created_at: string;
};

function parseTimeToMs(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const mm = m[1] ? parseInt(m[1], 10) : 0;
  const ss = parseInt(m[2], 10);
  const ms = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
  return mm * 60_000 + ss * 1000 + ms;
}

function msToStr(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const mm = Math.floor(total / 60_000);
  const rest = total - mm * 60_000;
  const ss = Math.floor(rest / 1000);
  const mss = rest - ss * 1000;
  return `${mm}:${String(ss).padStart(2, "0")}.${String(mss).padStart(3, "0")}`;
}

function AdminStandings() {
  const { leagueId } = useParams({ from: "/_authenticated/_admin/admin/ligaer/$leagueId/stillinger" });
  const qc = useQueryClient();
  const [divisionId, setDivisionId] = useState<string>("");

  const { data: league } = useQuery({
    queryKey: ["league-admin", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: divisions } = useQuery({
    queryKey: ["divisions-admin", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id,name,settings,race_date,track,layout")
        .eq("league_id", leagueId)
        .order("race_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["league-entries-for-standings", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id,user_id,driver_name,car_class,driver_category,car_number,waitlist,created_at")
        .eq("league_id", leagueId)
        .is("division_id", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntryRec[];
    },
  });

  useEffect(() => {
    if (!divisionId && divisions && divisions.length > 0) setDivisionId(divisions[0].id);
  }, [divisions, divisionId]);

  const division = divisions?.find((d: any) => d.id === divisionId);
  const configs: ClassConfig[] = Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];
  const leaguePoints: number[] = (() => {
    const arr = (league as any)?.points_system?.points_per_position;
    return Array.isArray(arr) && arr.length > 0 ? arr.map((n: any) => Number(n) || 0) : DEFAULT_POINTS_TABLE;
  })();
  const leagueFlPoints: number = Number((league as any)?.points_system?.fastest_lap_points ?? 1);

  return (
    <div className="space-y-4">
      <Link to="/admin/ligaer" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-3 w-3" /> Ligaer
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Stillinger</h1>
        {league && <p className="mt-1 text-sm text-muted-foreground">{league.name}</p>}
      </div>

      {(!divisions || divisions.length === 0) && (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Opret en afdeling først.</CardContent></Card>
      )}

      {divisions && divisions.length > 0 && (
        <div className="space-y-2">
          <Label>Vælg afdeling</Label>
          <Select value={divisionId} onValueChange={setDivisionId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {divisions.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}{d.settings?.completed ? " · Afsluttet" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {division && entries && divisions && (
        <DivisionEditor
          key={division.id}
          division={division}
          allDivisions={divisions}
          entries={entries.filter((e) => e.car_number != null)}
          configs={configs}
          pointsTable={leaguePoints}
          leagueFlPoints={leagueFlPoints}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["divisions-admin", leagueId] });
            qc.invalidateQueries({ queryKey: ["league-results", leagueId] });
            qc.invalidateQueries({ queryKey: ["league-entries-for-standings", leagueId] });
            qc.invalidateQueries({ queryKey: ["league-signups", leagueId] });
          }}
        />
      )}
    </div>
  );
}

function DivisionEditor({
  division,
  allDivisions,
  entries,
  configs,
  pointsTable,
  leagueFlPoints,
  onSaved,
}: {
  division: any;
  allDivisions: any[];
  entries: EntryRec[];
  configs: ClassConfig[];
  pointsTable: number[];
  leagueFlPoints: number;
  onSaved: () => void;
}) {
  const existing: any[] = Array.isArray(division.settings?.results) ? division.settings.results : [];
  const existingByKey = new Map(existing.map((r) => [`${r.car_class}|${r.driver_category}|${r.car_number}`, r]));

  // Only edit results for drivers currently on the grid (not waitlist) – waitlist drivers don't race
  const gridEntries = entries.filter((e) => !e.waitlist);

  const initialRows: DraftRow[] = gridEntries.map((e) => {
    const k = `${e.car_class}|${e.driver_category}|${e.car_number}`;
    const ex = existingByKey.get(k) as any;
    return {
      entry_id: e.id,
      user_id: e.user_id,
      car_number: e.car_number,
      driver_name: e.driver_name,
      car_class: e.car_class,
      driver_category: e.driver_category,
      time_str: ex && typeof ex.finish_time_ms === "number" && ex.finish_time_ms > 0 ? msToStr(ex.finish_time_ms) : "",
      penalty_seconds: Number(ex?.penalty_seconds ?? 0),
      penalty_points: Number(ex?.penalty_points ?? 0),
      fastest_lap: !!ex?.fastest_lap,
      dnf: !!ex?.dnf,
      dns: !!ex?.dns,
    };
  });

  const [rows, setRows] = useState<DraftRow[]>(initialRows);
  const [flPoints, setFlPoints] = useState<number>(Number(division.settings?.fastest_lap_points ?? 1));
  const [completed, setCompleted] = useState<boolean>(!!division.settings?.completed);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profiles for the entries on grid (for LMU name matching)
  const userIds = useMemo(() => Array.from(new Set(entries.map((e) => e.user_id))), [entries]);
  const { data: profiles } = useQuery({
    queryKey: ["profiles-lmu", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,lmu_name,display_name")
        .in("id", userIds);
      if (error) throw error;
      return (data ?? []) as { id: string; lmu_name: string | null; display_name: string | null }[];
    },
  });

  const setRow = (i: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const importXml = async (file: File) => {
    try {
      const text = await file.text();
      const parsedRace = parseLmuRaceFile(text);
      const parsed = parsedRace.drivers;

      // Fastest-lap winner per car class (raw, for matching to draft rows below)
      const flByClass = new Map<string, string>(); // class -> lowercase driver name
      const classes = Array.from(new Set(parsed.map((p) => p.carClass).filter(Boolean)));
      for (const cls of classes) {
        const inCls = parsed.filter((p) => p.carClass === cls && p.bestLapMs != null);
        if (inCls.length === 0) continue;
        inCls.sort((a, b) => (a.bestLapMs! - b.bestLapMs!));
        flByClass.set(cls, inCls[0].name.trim().toLowerCase());
      }

      // Build lmu_name -> userId lookup
      const lmuToUser = new Map<string, string>();
      const profilesWithLmu = (profiles ?? []).filter((p) => (p.lmu_name ?? "").trim().length > 0);
      for (const p of profilesWithLmu) {
        const key = (p.lmu_name ?? "").trim().toLowerCase();
        if (key) lmuToUser.set(key, p.id);
      }

      let matched = 0;
      let fuzzyMatched = 0;
      const missing: string[] = [];
      const noLmu: string[] = [];

      const updates = new Map<string, Partial<DraftRow>>();
      // Resolve a parsed driver name to a userId — exact first, then fuzzy (≥85%).
      const resolveUser = (parsedName: string): string | null => {
        const key = parsedName.trim().toLowerCase();
        const exact = lmuToUser.get(key);
        if (exact) return exact;
        const best = findBestNameMatch(parsedName, profilesWithLmu, (p) => p.lmu_name, 0.85);
        if (best) { fuzzyMatched++; return best.match.id; }
        return null;
      };
      for (const p of parsed) {
        const userId = resolveUser(p.name);
        if (!userId) { missing.push(p.name); continue; }
        const row = rows.find((r) => r.user_id === userId);
        if (!row) continue;
        const key = p.name.trim().toLowerCase();
        const isFl = flByClass.get(p.carClass) === key;
        if (p.finished && p.finishMs != null) {
          updates.set(row.entry_id, { time_str: msToStr(p.finishMs), fastest_lap: isFl, dnf: false, dns: false });
        } else {
          updates.set(row.entry_id, { time_str: "", fastest_lap: false, dnf: true, dns: false });
        }
        matched++;
      }

      // Drivers on grid with no lmu_name set on their profile
      for (const r of rows) {
        const prof = (profiles ?? []).find((p) => p.id === r.user_id);
        if (!prof?.lmu_name) noLmu.push(r.driver_name);
      }

      setRows((prev) => prev.map((r) => (updates.has(r.entry_id) ? { ...r, ...updates.get(r.entry_id)! } : r)));

      // Also push every valid best-lap into the global leaderboard
      const { data: { user } } = await supabase.auth.getUser();
      let lbInserted = 0;
      if (user) {
        const lbRows = parsed
          .filter((p) => p.bestLapMs != null && p.carClass)
          .map((p) => {
            const matchId = lmuToUser.get(p.name.trim().toLowerCase()) ?? (findBestNameMatch(p.name, profilesWithLmu, (x) => x.lmu_name, 0.85)?.match.id ?? null);
            if (!matchId) return null;
            return {
              user_id: matchId,
              driver_name: p.name,
              track: parsedRace.track,
              layout: parsedRace.layout,
              car_class: normalizeCarClass(p.carClass),
              car_model: p.carModel,
              best_lap_ms: p.bestLapMs!,
              source: "admin" as const,
              uploaded_by: user.id,
              division_id: division.id,
              recorded_at: parsedRace.recordedAt,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (lbRows.length > 0) {
          const { error: lbErr } = await supabase.from("leaderboard_times").insert(lbRows);
          if (lbErr) toast.warning(`Leaderboard ikke opdateret: ${lbErr.message}`);
          else lbInserted = lbRows.length;
        }
      }

      toast.success(`Importerede ${matched} kørere fra resultatfilen.${lbInserted ? ` ${lbInserted} tider lagt på leaderboardet.` : ""}`);
      if (missing.length > 0) {
        toast.warning(`${missing.length} kørere i filen blev ikke matchet: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
      }
      if (noLmu.length > 0) {
        toast.message(`${noLmu.length} kørere på grid mangler LMU-navn på profilen: ${noLmu.slice(0, 5).join(", ")}${noLmu.length > 5 ? "…" : ""}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke importere fil");
    }
  };

  const groupKeys = useMemo(() => {
    return configs.length
      ? configs.map((c) => `${c.car_class}|${c.driver_category}`)
      : Array.from(new Set(rows.map((r) => `${r.car_class}|${r.driver_category}`)));
  }, [configs, rows]);

  const preview = useMemo(() => {
    const out: Record<string, (DraftRow & { effective_ms: number | null; position: number; points: number })[]> = {};
    for (const k of groupKeys) out[k] = [];
    for (const r of rows) {
      const k = `${r.car_class}|${r.driver_category}`;
      if (!out[k]) out[k] = [];
      const baseMs = parseTimeToMs(r.time_str);
      const effective_ms = r.dnf || r.dns || baseMs == null ? null : baseMs + Math.max(0, r.penalty_seconds) * 1000;
      out[k].push({ ...r, effective_ms, position: 0, points: 0 });
    }
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => {
        if (a.effective_ms == null && b.effective_ms == null) return a.car_number - b.car_number;
        if (a.effective_ms == null) return 1;
        if (b.effective_ms == null) return -1;
        return a.effective_ms - b.effective_ms;
      });
      out[k].forEach((row, idx) => {
        const finished = row.effective_ms != null;
        row.position = finished ? idx + 1 : 0;
        row.points = finished ? pointsFor(row.position) : 0;
      });
    }
    return out;
  }, [rows, groupKeys]);

  const save = async () => {
    setSaving(true);
    try {
      for (const k of Object.keys(preview)) {
        const fls = preview[k].filter((r) => r.fastest_lap);
        if (fls.length > 1) {
          toast.error(`Kun én hurtigste omgang pr. klasse (${k.replace("|", " · ")})`);
          setSaving(false);
          return;
        }
      }
      const results: any[] = Object.values(preview).flatMap((list) =>
        list
          .filter((r) => r.position > 0)
          .map((r) => {
            const baseMs = parseTimeToMs(r.time_str)!;
            return {
              user_id: r.user_id,
              car_number: r.car_number,
              driver_name: r.driver_name,
              car_class: r.car_class,
              driver_category: r.driver_category,
              class_position: r.position,
              points: r.points,
              fastest_lap: r.fastest_lap,
              finish_time_ms: baseMs,
              penalty_seconds: Math.max(0, r.penalty_seconds),
              penalty_points: Math.max(0, r.penalty_points),
              effective_ms: baseMs + Math.max(0, r.penalty_seconds) * 1000,
              dnf: false,
              dns: false,
            };
          }),
      );
      for (const k of Object.keys(preview)) {
        for (const r of preview[k]) {
          if (r.position === 0) {
            results.push({
              user_id: r.user_id,
              car_number: r.car_number,
              driver_name: r.driver_name,
              car_class: r.car_class,
              driver_category: r.driver_category,
              class_position: 0,
              points: 0,
              fastest_lap: false,
              finish_time_ms: 0,
              penalty_seconds: Math.max(0, r.penalty_seconds),
              penalty_points: Math.max(0, r.penalty_points),
              effective_ms: 0,
              dnf: r.dnf && !r.dns,
              dns: r.dns,
            });
          }
        }
      }

      const newSettings = {
        ...(division.settings ?? {}),
        fastest_lap_points: flPoints,
        completed,
        results,
      };
      const { error } = await supabase.from("divisions").update({ settings: newSettings }).eq("id", division.id);
      if (error) throw error;

      // Recompute waitlist based on DNS counts across all divisions (including the one we just saved)
      await reconcileWaitlist({
        currentDivisionId: division.id,
        currentResults: results,
        allDivisions,
        entries,
        configs,
      });

      toast.success("Stillinger gemt");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke gemme");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {division.name}
              {completed && <Badge variant="secondary" className="gap-1 text-[10px]"><Check className="h-3 w-3" /> Afsluttet</Badge>}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {division.track}{division.layout ? ` · ${division.layout}` : ""}
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <Label className="text-xs">FL-point (pr. klasse)</Label>
              <Input
                className="w-24"
                type="text"
                inputMode="numeric"
                value={flPoints === 0 ? "" : String(flPoints)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setFlPoints(v === "" ? 0 : Number(v));
                }}
              />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
              Afsluttet
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importXml(f);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Importer LMU-fil
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" /> Gem</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {gridEntries.length === 0 && <p className="text-sm text-muted-foreground">Ingen kørere på grid.</p>}
        {groupKeys.map((k) => {
          const [cls, cat] = k.split("|");
          const groupRows = preview[k] ?? [];
          if (groupRows.length === 0) return null;
          return (
            <div key={k} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{cls}</h3>
                <Badge variant="outline" className="text-[10px]">{cat}</Badge>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 w-10">Pos</th>
                      <th className="px-2 py-1.5 w-12">Nr.</th>
                      <th className="px-2 py-1.5">Kører</th>
                      <th className="px-2 py-1.5 w-36">Tid (m:ss.xxx)</th>
                      <th className="px-2 py-1.5 w-28">Straf (s)</th>
                      <th className="px-2 py-1.5 w-28">Pointstraf</th>
                      <th className="px-2 py-1.5 w-28">Effektiv tid</th>
                      <th className="px-2 py-1.5 w-16 text-center">FL</th>
                      <th className="px-2 py-1.5 w-16 text-center">DNF</th>
                      <th className="px-2 py-1.5 w-16 text-center">DNS</th>
                      <th className="px-2 py-1.5 w-14 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRows.map((r) => {
                      const i = rows.findIndex((x) => x.entry_id === r.entry_id);
                      const basePts = r.points + (r.fastest_lap && r.position > 0 ? flPoints : 0);
                      const totalPts = Math.max(0, basePts - Math.max(0, r.penalty_points));
                      return (
                        <tr key={r.entry_id} className="border-t border-border">
                          <td className="px-2 py-1.5 font-semibold tabular-nums">{r.position > 0 ? r.position : r.dns ? <span className="text-[10px] text-destructive">DNS</span> : "–"}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{r.car_number}</td>
                          <td className="px-2 py-1.5 truncate">{r.driver_name}</td>
                          <td className="px-2 py-1.5">
                            <Input
                              className="h-8 min-w-[100px]"
                              placeholder="1:32.456"
                              value={r.time_str}
                              onChange={(e) => setRow(i, { time_str: e.target.value })}
                              disabled={r.dnf || r.dns}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              className="h-8 min-w-[70px]"
                              type="text"
                              inputMode="numeric"
                              value={r.penalty_seconds === 0 ? "" : String(r.penalty_seconds)}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9]/g, "");
                                setRow(i, { penalty_seconds: v === "" ? 0 : Number(v) });
                              }}
                              disabled={r.dnf || r.dns}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              className="h-8 min-w-[70px]"
                              type="text"
                              inputMode="numeric"
                              value={r.penalty_points === 0 ? "" : String(r.penalty_points)}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9]/g, "");
                                setRow(i, { penalty_points: v === "" ? 0 : Number(v) });
                              }}
                              disabled={r.dnf || r.dns}
                            />
                          </td>
                          <td className="px-2 py-1.5 tabular-nums text-xs text-muted-foreground">
                            {r.effective_ms != null ? msToStr(r.effective_ms) : "–"}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={r.fastest_lap}
                              onChange={(e) => setRow(i, { fastest_lap: e.target.checked })}
                              disabled={r.dnf || r.dns}
                              aria-label="Fastest lap"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={r.dnf}
                              onChange={(e) => setRow(i, { dnf: e.target.checked, dns: e.target.checked ? false : r.dns })}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={r.dns}
                              onChange={(e) => setRow(i, { dns: e.target.checked, dnf: e.target.checked ? false : r.dnf, fastest_lap: false })}
                              title="Did Not Show"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                            <span className="inline-flex items-center gap-0.5">
                              {totalPts}
                              {r.fastest_lap && r.position > 0 && <Zap className="h-3 w-3 text-primary" />}
                              {r.penalty_points > 0 && <span className="text-[10px] text-destructive">-{r.penalty_points}p</span>}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Pointskala: {POINTS_TABLE.join(", ")}. Tidsstraf lægges til kørerens tid. DNS = Did Not Show: når en kører når DNS-grænsen pr. klasse, rykkes vedkommende bagerst på ventelisten, og første ventelistekører rykker op på griddet.
        </p>
      </CardContent>
    </Card>
  );
}

async function reconcileWaitlist({
  currentDivisionId,
  currentResults,
  allDivisions,
  entries,
  configs,
}: {
  currentDivisionId: string;
  currentResults: any[];
  allDivisions: any[];
  entries: EntryRec[];
  configs: ClassConfig[];
}) {
  // Count DNS per entry across divisions (using current edits for the saved one)
  const dnsByEntry = new Map<string, number>(); // entry_id -> count
  const entryByKey = new Map<string, EntryRec>();
  for (const e of entries) entryByKey.set(`${e.car_class}|${e.driver_category}|${e.car_number}`, e);

  const countResults = (results: any[]) => {
    for (const r of results) {
      if (!r?.dns) continue;
      const key = `${r.car_class}|${r.driver_category}|${r.car_number}`;
      const ent = entryByKey.get(key);
      if (!ent) continue;
      dnsByEntry.set(ent.id, (dnsByEntry.get(ent.id) ?? 0) + 1);
    }
  };

  for (const d of allDivisions) {
    if (d.id === currentDivisionId) continue;
    if (Array.isArray(d.settings?.results)) countResults(d.settings.results);
  }
  countResults(currentResults);

  // For each class config that has a dns_limit, demote those past the limit and promote from waitlist
  const updates: { id: string; waitlist: boolean }[] = [];
  for (const cfg of configs) {
    if (!cfg.dns_limit || cfg.dns_limit <= 0) continue;
    const classEntries = entries.filter((e) => e.car_class === cfg.car_class && e.driver_category === cfg.driver_category);
    const grid = classEntries.filter((e) => !e.waitlist);
    const wait = classEntries.filter((e) => e.waitlist).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

    let openSlots = 0;
    const stillOnGrid: EntryRec[] = [];
    for (const e of grid) {
      if ((dnsByEntry.get(e.id) ?? 0) >= cfg.dns_limit) {
        updates.push({ id: e.id, waitlist: true });
        openSlots++;
      } else {
        stillOnGrid.push(e);
      }
    }
    // If grid has a max_drivers and we freed slots, promote from waitlist
    const cap = cfg.max_drivers ?? Infinity;
    const room = Math.max(0, cap - stillOnGrid.length);
    const promotions = Math.min(openSlots, room, wait.length);
    for (let i = 0; i < promotions; i++) {
      updates.push({ id: wait[i].id, waitlist: false });
    }
  }

  for (const u of updates) {
    const { error } = await supabase.from("entries").update({ waitlist: u.waitlist }).eq("id", u.id);
    if (error) throw error;
  }
  if (updates.length > 0) {
    const promoted = updates.filter((u) => !u.waitlist).length;
    const demoted = updates.filter((u) => u.waitlist).length;
    toast.message(`Venteliste opdateret: ${demoted} flyttet til venteliste, ${promoted} rykket op på grid.`);
  }
}
