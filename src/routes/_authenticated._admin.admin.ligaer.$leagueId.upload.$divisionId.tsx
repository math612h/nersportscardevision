import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { previewLeagueRaceResult, publishLeagueRaceResult } from "@/lib/league-results.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute(
  "/_authenticated/_admin/admin/ligaer/$leagueId/upload/$divisionId",
)({ component: UploadResultsPage });

type SessionType = "race" | "qualifying";

type EditableRow = {
  user_id: string;
  driver_name: string;
  car_class: string;
  car_model: string | null;
  car_number: number | null;
  driver_category: string | null;
  best_lap_ms: number | null;
  finish_ms: number | null;
  laps: number | null;
  finished: boolean;
  rawPosition: number | null;
  // edits
  time_penalty_ms: number;
  position_penalty: number;
  points_penalty: number;
  dsq: boolean;
  dnf: boolean;
  fastest_lap: boolean;
};

type SessionState = {
  fileName: string;
  unmatched: string[];
  rows: EditableRow[];
};

function fmtTime(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "–";
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  if (m > 0) return `${m}:${s.toFixed(3).padStart(6, "0")}`;
  return `${s.toFixed(3)}`;
}

function UploadResultsPage() {
  const { leagueId, divisionId } = useParams({
    from: "/_authenticated/_admin/admin/ligaer/$leagueId/afdelinger/$divisionId/upload",
  });
  const preview = useServerFn(previewLeagueRaceResult);
  const publish = useServerFn(publishLeagueRaceResult);

  const [trackLayout, setTrackLayout] = useState<{ track: string; layout: string | null } | null>(null);
  const [quali, setQuali] = useState<SessionState | null>(null);
  const [race, setRace] = useState<SessionState | null>(null);
  const [publishing, setPublishing] = useState(false);

  const { data: league } = useQuery({
    queryKey: ["league-points", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues").select("id,name,points_system").eq("id", leagueId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: division } = useQuery({
    queryKey: ["division-info", divisionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions").select("id,name,track,layout").eq("id", divisionId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const pointsTable: number[] = useMemo(() => {
    const arr = (league?.points_system as any)?.points_per_position;
    return Array.isArray(arr) ? arr.map((n: any) => Number(n) || 0) : [];
  }, [league]);
  const flPoints = Number((league?.points_system as any)?.fastest_lap_points ?? 0);

  const handleFile = (sessionType: SessionType) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) return toast.error("Filen er for stor (max 5 MB)");
    try {
      const xml = await file.text();
      const res = await preview({ data: { leagueId, divisionId, xml, sessionType } });
      if (!trackLayout) setTrackLayout({ track: res.track, layout: res.layout });
      const rows: EditableRow[] = res.rows.map((r) => ({
        user_id: r.user_id,
        driver_name: r.driver_name,
        car_class: r.car_class,
        car_model: r.car_model,
        car_number: r.car_number,
        driver_category: r.driver_category,
        best_lap_ms: r.best_lap_ms,
        finish_ms: r.finish_ms,
        laps: r.laps,
        finished: r.finished,
        rawPosition: r.position,
        time_penalty_ms: 0,
        position_penalty: 0,
        points_penalty: 0,
        dsq: false,
        dnf: false,
        fastest_lap: false,
      }));
      const state: SessionState = {
        fileName: file.name,
        unmatched: res.unmatched,
        rows,
      };
      if (sessionType === "race") setRace(state);
      else setQuali(state);
      toast.success(`${sessionType === "race" ? "Race" : "Quali"}-fil indlæst (${rows.length} kørere)`);
      if (res.unmatched.length) {
        toast.warning(`Ikke matchet: ${res.unmatched.slice(0, 3).join(", ")}${res.unmatched.length > 3 ? "…" : ""}`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Kunne ikke læse fil");
    }
  };

  // Per-class ranking with penalties applied. Used both for display and submit.
  const rankSession = (state: SessionState | null, kind: SessionType) => {
    if (!state) return null;
    const byClass = new Map<string, EditableRow[]>();
    for (const r of state.rows) {
      if (!byClass.has(r.car_class)) byClass.set(r.car_class, []);
      byClass.get(r.car_class)!.push(r);
    }
    const out: { car_class: string; ranked: Array<EditableRow & { position: number; points: number; effectiveFinishMs: number | null }> }[] = [];
    for (const [cls, arr] of byClass) {
      const enriched = arr.map((r) => ({
        ...r,
        effectiveFinishMs: r.finish_ms != null ? r.finish_ms + (r.time_penalty_ms || 0) : null,
      }));
      const nonDsq = enriched.filter((r) => !r.dsq);
      const dsq = enriched.filter((r) => r.dsq);
      nonDsq.sort((a, b) => {
        // finished first by (laps desc, effective finish asc), then unfinished by (laps desc, best lap asc)
        const aFin = a.finished && a.effectiveFinishMs != null;
        const bFin = b.finished && b.effectiveFinishMs != null;
        if (aFin !== bFin) return aFin ? -1 : 1;
        const lapsCmp = (b.laps ?? 0) - (a.laps ?? 0);
        if (lapsCmp !== 0) return lapsCmp;
        if (aFin && bFin) return (a.effectiveFinishMs! - b.effectiveFinishMs!);
        return (a.best_lap_ms ?? Number.MAX_SAFE_INTEGER) - (b.best_lap_ms ?? Number.MAX_SAFE_INTEGER);
      });
      // Apply position penalty by swapping further down
      const arrCopy = [...nonDsq];
      for (let i = 0; i < arrCopy.length; i++) {
        const r = arrCopy[i];
        const delta = Math.max(0, r.position_penalty | 0);
        if (delta > 0) {
          const target = Math.min(arrCopy.length - 1, i + delta);
          if (target !== i) {
            arrCopy.splice(i, 1);
            arrCopy.splice(target, 0, r);
            i = -1; // restart since order changed
          }
        }
      }
      const finalArr = [...arrCopy, ...dsq];
      // Determine FL within class (auto-assign from fastest_lap flag if set, else infer)
      const explicitFL = finalArr.find((r) => r.fastest_lap && !r.dsq && !r.dnf);
      let flDriver: EditableRow | null = explicitFL ?? null;
      if (!flDriver) {
        // infer: lowest best_lap_ms among non-dsq non-dnf
        const cand = finalArr.filter((r) => !r.dsq && !r.dnf && r.best_lap_ms != null);
        if (cand.length) flDriver = cand.reduce((b, c) => (c.best_lap_ms! < (b.best_lap_ms ?? Infinity) ? c : b));
      }
      const ranked = finalArr.map((r, idx) => {
        const position = idx + 1;
        let points = 0;
        if (kind === "race" && !r.dsq && !r.dnf) {
          const base = pointsTable[idx] ?? 0;
          const fl = flDriver && flDriver.user_id === r.user_id ? flPoints : 0;
          points = Math.max(0, base + fl - (r.points_penalty || 0));
        }
        return { ...r, position, points, fastest_lap: flDriver?.user_id === r.user_id };
      });
      out.push({ car_class: cls, ranked });
    }
    return out;
  };

  const submit = async () => {
    if (!race && !quali) return toast.error("Vælg mindst én fil");
    setPublishing(true);
    try {
      const sessions: Array<{ sessionType: SessionType; rows: any[] }> = [];
      for (const kind of ["race", "qualifying"] as SessionType[]) {
        const state = kind === "race" ? race : quali;
        const ranked = rankSession(state, kind);
        if (!ranked) continue;
        const flat = ranked.flatMap((c) =>
          c.ranked.map((r) => ({
            user_id: r.user_id,
            driver_name: r.driver_name,
            car_class: r.car_class,
            car_model: r.car_model,
            car_number: r.car_number,
            driver_category: r.driver_category,
            best_lap_ms: r.best_lap_ms,
            finish_ms: r.finish_ms,
            laps: r.laps,
            position: r.position,
            points: r.points,
            time_penalty_ms: r.time_penalty_ms,
            position_penalty: r.position_penalty,
            points_penalty: r.points_penalty,
            dsq: r.dsq,
            dnf: r.dnf,
            fastest_lap: r.fastest_lap,
          })),
        );
        sessions.push({ sessionType: kind, rows: flat });
      }
      await publish({
        data: {
          leagueId, divisionId,
          track: trackLayout?.track ?? division?.track ?? "",
          layout: trackLayout?.layout ?? division?.layout ?? null,
          sessions,
        },
      });
      toast.success("Resultater publiceret");
    } catch (err: any) {
      toast.error(err?.message ?? "Publicering fejlede");
    } finally {
      setPublishing(false);
    }
  };

  const SessionTable = ({ state, kind, onUpdate, onClear }: {
    state: SessionState;
    kind: SessionType;
    onUpdate: (uid: string, patch: Partial<EditableRow>) => void;
    onClear: () => void;
  }) => {
    const ranked = rankSession(state, kind) ?? [];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Fil: <span className="font-mono">{state.fileName}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear} className="gap-1">
            <Trash2 className="h-3 w-3" /> Ryd
          </Button>
        </div>
        {state.unmatched.length > 0 && (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 p-2 text-xs">
            <strong>Ikke matchet med tilmeldinger:</strong> {state.unmatched.join(", ")}
          </div>
        )}
        {ranked.map((cls) => (
          <Card key={cls.car_class}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{cls.car_class}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2 w-8">Pos</th>
                    <th className="py-1 pr-2">Kører</th>
                    <th className="py-1 pr-2 w-16">Omg.</th>
                    <th className="py-1 pr-2 w-24">Bedste</th>
                    <th className="py-1 pr-2 w-24">Tid</th>
                    <th className="py-1 px-1 w-20" title="Tidsstraf (sek)">+sek</th>
                    <th className="py-1 px-1 w-16" title="Pladser ned">+pos</th>
                    <th className="py-1 px-1 w-16" title="Pointstraf">-pt</th>
                    <th className="py-1 px-1 w-12 text-center" title="DSQ">DSQ</th>
                    <th className="py-1 px-1 w-12 text-center" title="DNF">DNF</th>
                    <th className="py-1 pl-2 w-14 text-right">Point</th>
                  </tr>
                </thead>
                <tbody>
                  {cls.ranked.map((r) => (
                    <tr key={r.user_id} className="border-t border-border">
                      <td className="py-1 pr-2 font-semibold tabular-nums">{r.dsq ? "DSQ" : r.position}</td>
                      <td className="py-1 pr-2 truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{r.driver_name}</span>
                          {r.fastest_lap && <Badge variant="outline" className="text-[9px]">FL</Badge>}
                          {r.car_number != null && <span className="text-muted-foreground">#{r.car_number}</span>}
                        </div>
                      </td>
                      <td className="py-1 pr-2 tabular-nums">{r.laps ?? "–"}</td>
                      <td className="py-1 pr-2 tabular-nums">{fmtTime(r.best_lap_ms)}</td>
                      <td className="py-1 pr-2 tabular-nums">{fmtTime(r.finish_ms)}</td>
                      <td className="py-1 px-1">
                        <Input
                          type="number"
                          min={0}
                          className="h-7 w-16 px-1 text-xs"
                          value={Math.round((r.time_penalty_ms || 0) / 1000) || ""}
                          onChange={(e) => onUpdate(r.user_id, { time_penalty_ms: Math.max(0, Number(e.target.value || 0)) * 1000 })}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <Input
                          type="number"
                          min={0}
                          className="h-7 w-14 px-1 text-xs"
                          value={r.position_penalty || ""}
                          onChange={(e) => onUpdate(r.user_id, { position_penalty: Math.max(0, Number(e.target.value || 0)) })}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <Input
                          type="number"
                          min={0}
                          className="h-7 w-14 px-1 text-xs"
                          value={r.points_penalty || ""}
                          onChange={(e) => onUpdate(r.user_id, { points_penalty: Math.max(0, Number(e.target.value || 0)) })}
                        />
                      </td>
                      <td className="py-1 px-1 text-center">
                        <input
                          type="checkbox"
                          checked={r.dsq}
                          onChange={(e) => onUpdate(r.user_id, { dsq: e.target.checked })}
                        />
                      </td>
                      <td className="py-1 px-1 text-center">
                        <input
                          type="checkbox"
                          checked={r.dnf}
                          onChange={(e) => onUpdate(r.user_id, { dnf: e.target.checked })}
                        />
                      </td>
                      <td className="py-1 pl-2 text-right font-semibold tabular-nums">{kind === "qualifying" ? "–" : r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const updateRow = (kind: SessionType) => (uid: string, patch: Partial<EditableRow>) => {
    const setter = kind === "race" ? setRace : setQuali;
    setter((prev) => prev ? { ...prev, rows: prev.rows.map((r) => r.user_id === uid ? { ...r, ...patch } : r) } : prev);
  };

  return (
    <div className="space-y-4">
      <Link to="/admin/ligaer/$leagueId/afdelinger" params={{ leagueId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-3 w-3" /> Tilbage til afdelinger
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Upload resultater</h1>
        <p className="text-sm text-muted-foreground">{division?.name ?? ""} · {league?.name ?? ""}</p>
        {trackLayout && (
          <p className="mt-1 text-xs text-muted-foreground">
            Læst bane: <span className="font-mono">{trackLayout.track}{trackLayout.layout ? ` · ${trackLayout.layout}` : ""}</span>
          </p>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Vælg filer</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Quali-fil (XML)</Label>
              <Input type="file" accept=".xml,application/xml,text/xml" onChange={handleFile("qualifying")} />
              {quali && <p className="mt-1 text-xs text-muted-foreground">{quali.rows.length} kørere indlæst</p>}
            </div>
            <div>
              <Label>Race-fil (XML)</Label>
              <Input type="file" accept=".xml,application/xml,text/xml" onChange={handleFile("race")} />
              {race && <p className="mt-1 text-xs text-muted-foreground">{race.rows.length} kørere indlæst</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {quali && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Kvalifikation</h2>
          <SessionTable state={quali} kind="qualifying" onUpdate={updateRow("qualifying")} onClear={() => setQuali(null)} />
        </section>
      )}
      {race && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Race</h2>
          <SessionTable state={race} kind="race" onUpdate={updateRow("race")} onClear={() => setRace(null)} />
        </section>
      )}

      {(quali || race) && (
        <div className="sticky bottom-2 z-10 flex justify-end">
          <Button onClick={submit} disabled={publishing} className="gap-2 shadow-lg">
            <Upload className="h-4 w-4" /> {publishing ? "Publicerer…" : "Publicér resultater"}
          </Button>
        </div>
      )}
    </div>
  );
}
