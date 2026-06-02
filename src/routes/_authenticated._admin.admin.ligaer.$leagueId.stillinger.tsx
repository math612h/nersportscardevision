import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Zap, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ClassConfig } from "@/lib/tracks";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer/$leagueId/stillinger")({
  component: AdminStandings,
});

// Default championship points table by class position
const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const pointsFor = (pos: number) => (pos >= 1 && pos <= POINTS_TABLE.length ? POINTS_TABLE[pos - 1] : 0);

type DraftRow = {
  entry_id: string;
  user_id: string;
  car_number: number;
  driver_name: string;
  car_class: string;
  driver_category: string;
  time_str: string;
  penalty_seconds: number;
  fastest_lap: boolean;
  dnf: boolean;
  dns: boolean;
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
        .select("user_id,driver_name,car_class,driver_category,car_number")
        .eq("league_id", leagueId)
        .is("division_id", null)
        .order("car_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!divisionId && divisions && divisions.length > 0) setDivisionId(divisions[0].id);
  }, [divisions, divisionId]);

  const division = divisions?.find((d: any) => d.id === divisionId);
  const configs: ClassConfig[] = Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];

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

      {division && entries && (
        <DivisionEditor
          key={division.id}
          division={division}
          entries={entries.filter((e) => e.car_number != null) as any}
          configs={configs}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["divisions-admin", leagueId] });
            qc.invalidateQueries({ queryKey: ["league-results", leagueId] });
          }}
        />
      )}
    </div>
  );
}

function DivisionEditor({
  division,
  entries,
  configs,
  onSaved,
}: {
  division: any;
  entries: { user_id: string; driver_name: string; car_class: string; driver_category: string; car_number: number }[];
  configs: ClassConfig[];
  onSaved: () => void;
}) {
  const existing: any[] = Array.isArray(division.settings?.results) ? division.settings.results : [];
  const existingByKey = new Map(existing.map((r) => [`${r.car_class}|${r.driver_category}|${r.car_number}`, r]));

  const initialRows: DraftRow[] = entries.map((e) => {
    const k = `${e.car_class}|${e.driver_category}|${e.car_number}`;
    const ex = existingByKey.get(k) as any;
    return {
      user_id: e.user_id,
      car_number: e.car_number,
      driver_name: e.driver_name,
      car_class: e.car_class,
      driver_category: e.driver_category,
      time_str: ex && typeof ex.finish_time_ms === "number" ? msToStr(ex.finish_time_ms) : "",
      penalty_seconds: Number(ex?.penalty_seconds ?? 0),
      fastest_lap: !!ex?.fastest_lap,
      dnf: !!ex?.dnf,
    };
  });

  const [rows, setRows] = useState<DraftRow[]>(initialRows);
  const [flPoints, setFlPoints] = useState<number>(Number(division.settings?.fastest_lap_points ?? 1));
  const [completed, setCompleted] = useState<boolean>(!!division.settings?.completed);
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // Group keys (use configs if present, else derived)
  const groupKeys = useMemo(() => {
    return configs.length
      ? configs.map((c) => `${c.car_class}|${c.driver_category}`)
      : Array.from(new Set(rows.map((r) => `${r.car_class}|${r.driver_category}`)));
  }, [configs, rows]);

  // Compute live preview standings: per class, sort by (effective_ms), DNF/no-time at the bottom
  const preview = useMemo(() => {
    const out: Record<string, (DraftRow & { effective_ms: number | null; position: number; points: number })[]> = {};
    for (const k of groupKeys) out[k] = [];
    for (const r of rows) {
      const k = `${r.car_class}|${r.driver_category}`;
      if (!out[k]) out[k] = [];
      const baseMs = parseTimeToMs(r.time_str);
      const effective_ms = r.dnf || baseMs == null ? null : baseMs + Math.max(0, r.penalty_seconds) * 1000;
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
      // Validate: at most one fastest lap per class
      for (const k of Object.keys(preview)) {
        const fls = preview[k].filter((r) => r.fastest_lap);
        if (fls.length > 1) {
          toast.error(`Kun én hurtigste omgang pr. klasse (${k.replace("|", " · ")})`);
          setSaving(false);
          return;
        }
      }
      // Flatten results
      const results = Object.values(preview).flatMap((list) =>
        list
          .filter((r) => r.position > 0) // skip non-finishers
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
              effective_ms: baseMs + Math.max(0, r.penalty_seconds) * 1000,
              dnf: false,
            };
          }),
      );
      // Include DNFs (no points)
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
              effective_ms: 0,
              dnf: true,
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
              <Input className="w-24" type="number" min={0} max={50} value={flPoints} onChange={(e) => setFlPoints(Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
              Afsluttet
            </label>
            <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" /> Gem</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {entries.length === 0 && <p className="text-sm text-muted-foreground">Ingen tilmeldinger på ligaen endnu.</p>}
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
                      <th className="px-2 py-1.5 w-32">Tid (m:ss.xxx)</th>
                      <th className="px-2 py-1.5 w-24">Straf (s)</th>
                      <th className="px-2 py-1.5 w-28">Effektiv tid</th>
                      <th className="px-2 py-1.5 w-12 text-center">FL</th>
                      <th className="px-2 py-1.5 w-14 text-center">DNF</th>
                      <th className="px-2 py-1.5 w-12 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRows.map((r) => {
                      const i = rows.findIndex((x) => x.user_id === r.user_id && x.car_number === r.car_number);
                      const totalPts = r.points + (r.fastest_lap && r.position > 0 ? flPoints : 0);
                      return (
                        <tr key={`${r.car_class}-${r.car_number}-${r.user_id}`} className="border-t border-border">
                          <td className="px-2 py-1.5 font-semibold tabular-nums">{r.position > 0 ? r.position : "–"}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{r.car_number}</td>
                          <td className="px-2 py-1.5 truncate">{r.driver_name}</td>
                          <td className="px-2 py-1.5">
                            <Input
                              className="h-8"
                              placeholder="1:32.456"
                              value={r.time_str}
                              onChange={(e) => setRow(i, { time_str: e.target.value })}
                              disabled={r.dnf}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              className="h-8"
                              type="number"
                              min={0}
                              step={1}
                              value={r.penalty_seconds}
                              onChange={(e) => setRow(i, { penalty_seconds: Number(e.target.value) })}
                              disabled={r.dnf}
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
                              disabled={r.dnf}
                              aria-label="Fastest lap"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={r.dnf}
                              onChange={(e) => setRow(i, { dnf: e.target.checked })}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                            <span className="inline-flex items-center gap-0.5">
                              {totalPts}
                              {r.fastest_lap && r.position > 0 && <Zap className="h-3 w-3 text-primary" />}
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
          Pointskala (klasse-position): {POINTS_TABLE.join(", ")}. Tidsstraf lægges til kørerens tid og kan derved rykke vedkommende ned i klassen. FL-point tildeles til den med markeret hurtigste omgang i klassen.
        </p>
      </CardContent>
    </Card>
  );
}
