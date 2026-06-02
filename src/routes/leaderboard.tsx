import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Trophy, Upload, Timer, MapPin, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseLmuRaceFile, normalizeCarClass, msToLapStr, CAR_CLASS_OPTIONS } from "@/lib/lmu-parser";
import { DriverLink } from "@/components/DriverLink";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard – NER Sportscar Division" },
      { name: "description", content: "Hurtigste omgangstider pr. bane og bilklasse på tværs af alle løb i Le Mans Ultimate." },
      { property: "og:title", content: "Leaderboard – NER Sportscar Division" },
      { property: "og:description", content: "Hurtigste omgangstider pr. bane og bilklasse på tværs af alle løb i Le Mans Ultimate." },
    ],
  }),
  component: LeaderboardPage,
});

type Row = {
  id: string;
  user_id: string | null;
  driver_name: string;
  track: string;
  layout: string | null;
  car_class: string;
  car_model: string | null;
  best_lap_ms: number;
  source: "admin" | "user";
  recorded_at: string | null;
  created_at: string;
};

const ALL = "__all__";

function LeaderboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard_times")
        .select("id,user_id,driver_name,track,layout,car_class,car_model,best_lap_ms,source,recorded_at,created_at")
        .order("best_lap_ms", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const [carClass, setCarClass] = useState<string>(ALL);
  const [track, setTrack] = useState<string>(ALL);
  const [layout, setLayout] = useState<string>(ALL);

  const tracks = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.track))).sort(),
    [rows],
  );
  const layouts = useMemo(
    () =>
      Array.from(
        new Set(
          (rows ?? [])
            .filter((r) => track === ALL || r.track === track)
            .map((r) => r.layout ?? "")
            .filter(Boolean),
        ),
      ).sort(),
    [rows, track],
  );
  const classes = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.car_class))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const list = (rows ?? []).filter((r) => {
      if (carClass !== ALL && r.car_class !== carClass) return false;
      if (track !== ALL && r.track !== track) return false;
      if (layout !== ALL && (r.layout ?? "") !== layout) return false;
      return true;
    });
    // Best lap per driver (key by user_id when present, else lowercased name)
    const bestByDriver = new Map<string, Row>();
    for (const r of list) {
      const key = `${r.car_class}|${r.track}|${r.layout ?? ""}|${r.user_id ?? `name:${r.driver_name.toLowerCase()}`}`;
      const cur = bestByDriver.get(key);
      if (!cur || r.best_lap_ms < cur.best_lap_ms) bestByDriver.set(key, r);
    }
    return Array.from(bestByDriver.values()).sort((a, b) => a.best_lap_ms - b.best_lap_ms);
  }, [rows, carClass, track, layout]);

  const handleFile = async (file: File) => {
    if (!user) { toast.error("Log ind for at uploade din egen tid."); return; }
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = parseLmuRaceFile(text);

      // Look up the uploader's LMU name
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("lmu_name")
        .eq("id", user.id)
        .maybeSingle();
      if (pErr) throw pErr;
      const lmu = (profile?.lmu_name ?? "").trim().toLowerCase();
      if (!lmu) {
        toast.error("Du mangler at sætte dit LMU-navn på profilen først.");
        return;
      }

      const me = parsed.drivers.find((d) => d.name.trim().toLowerCase() === lmu);
      if (!me) {
        toast.error(`Dit navn “${profile!.lmu_name}” findes ikke i filen. Tjek at det matcher præcis.`);
        return;
      }
      if (me.bestLapMs == null) {
        toast.error("Ingen gyldig hurtigste omgang fundet for dig i filen.");
        return;
      }

      const { error } = await supabase.from("leaderboard_times").insert({
        user_id: user.id,
        driver_name: me.name,
        track: parsed.track,
        layout: parsed.layout,
        car_class: normalizeCarClass(me.carClass),
        car_model: me.carModel,
        best_lap_ms: me.bestLapMs,
        source: "user",
        uploaded_by: user.id,
        recorded_at: parsed.recordedAt,
      });
      if (error) throw error;

      toast.success(`Tid uploadet: ${msToLapStr(me.bestLapMs)} på ${parsed.track}${parsed.layout ? ` (${parsed.layout})` : ""}.`);
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke læse filen");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Link to="/lmu" className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tilbage
      </Link>

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Le Mans Ultimate</p>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Hurtigste omgangstider på tværs af alle løb, samlet pr. bane og bilklasse.</p>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="flex items-center gap-2 text-primary">
            <Upload className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">Upload din race-fil</span>
          </div>
          <p className="flex-1 min-w-[12rem] text-xs text-muted-foreground">
            Upload en LMU resultat-XML — din tid bliver automatisk lagt på leaderboardet via dit LMU-navn.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {user ? (
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
              <Upload className="h-4 w-4" /> {uploading ? "Læser…" : "Vælg fil"}
            </Button>
          ) : (
            <Button asChild><Link to="/login">Log ind for at uploade</Link></Button>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Filter className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Filtre</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Bilklasse</Label>
            <Select value={carClass} onValueChange={setCarClass}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle klasser</SelectItem>
                {CAR_CLASS_OPTIONS.filter((c) => classes.includes(c)).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
                {classes.filter((c) => !CAR_CLASS_OPTIONS.includes(c as any)).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Bane</Label>
            <Select value={track} onValueChange={(v) => { setTrack(v); setLayout(ALL); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle baner</SelectItem>
                {tracks.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Layout</Label>
            <Select value={layout} onValueChange={setLayout} disabled={layouts.length === 0}>
              <SelectTrigger><SelectValue placeholder={layouts.length === 0 ? "–" : "Vælg"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle layouts</SelectItem>
                {layouts.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Hurtigste omgange</h2>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Indlæser…</p>}
        {!isLoading && filtered.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Ingen tider matcher dit filter endnu.
          </CardContent></Card>
        )}

        {filtered.length > 0 && (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-10">#</th>
                    <th className="px-3 py-2">Kører</th>
                    <th className="px-3 py-2">Bilklasse</th>
                    <th className="px-3 py-2">Bil</th>
                    <th className="px-3 py-2">Bane</th>
                    <th className="px-3 py-2 hidden sm:table-cell">Layout</th>
                    <th className="px-3 py-2 text-right">Bedste omgang</th>
                    <th className="px-3 py-2 hidden md:table-cell text-center">Kilde</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 font-semibold tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <DriverLink userId={r.user_id} name={r.driver_name} className="truncate" />
                          {!r.user_id && <Badge variant="outline" className="text-[10px]">Gæst</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px]">{r.car_class}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">{r.car_model ?? "–"}</td>
                      <td className="px-3 py-2"><span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" />{r.track}</span></td>
                      <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{r.layout ?? "–"}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3 text-primary" />{msToLapStr(r.best_lap_ms)}</span>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell text-center">
                        <Badge variant={r.source === "admin" ? "default" : "outline"} className="text-[10px]">
                          {r.source === "admin" ? "Officielt løb" : "Bruger"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
