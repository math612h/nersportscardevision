import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Trophy, Upload, Timer, MapPin, Filter, Trash2, Monitor, User as UserIcon, ChevronRight, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseLmuRaceFile, normalizeCarClass, msToLapStr, CAR_CLASS_OPTIONS, nameSimilarity } from "@/lib/lmu-parser";
import { DriverLink } from "@/components/DriverLink";
import { PersonalBestPanel } from "@/components/PersonalBestPanel";
import { getLeaderboardRows } from "@/lib/leaderboard.functions";
import { classColor } from "@/lib/lmu-cars";
import { GuestLock } from "@/components/GuestGate";

const COMPANION_DOWNLOAD_URL =
  "https://github.com/math612h/nersportscardevision/releases/latest/download/LMU-Danmark-Tracker-Setup.exe";

const LB_TITLE = "Leaderboard — hurtigste omgangstider i Le Mans Ultimate";
const LB_DESC =
  "Hurtigste omgangstider pr. bane og bilklasse på tværs af alle LMU Danmark-løb i Le Mans Ultimate. Upload din race-fil og kom på listen.";
const LB_URL = "https://danishenduranceseries.dk/leaderboard";

const displayTrackName = (track: string) => track;

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: LB_TITLE },
      { name: "description", content: LB_DESC },
      { property: "og:title", content: LB_TITLE },
      { property: "og:description", content: LB_DESC },
      { property: "og:url", content: LB_URL },
    ],
    links: [{ rel: "canonical", href: LB_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "LMU Danmark — Le Mans Ultimate leaderboard",
          description: LB_DESC,
          url: LB_URL,
          creator: { "@type": "Organization", name: "LMU Danmark" },
          variableMeasured: ["best lap time", "track", "car class"],
        }),
      },
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
  source: "admin" | "user" | "league";
  recorded_at: string | null;
  created_at: string;
};

const ALL = "__all__";

function LeaderboardPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const fetchLeaderboard = useServerFn(getLeaderboardRows);



  const { data: rows, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const data = await fetchLeaderboard();
      return data as Row[];
    },
  });

  const [carClass, setCarClass] = useState<string>(ALL);
  const [track, setTrack] = useState<string>(ALL);
  const [layout, setLayout] = useState<string>(ALL);

  const trackLayoutMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of rows ?? []) {
      if (!m.has(r.track)) m.set(r.track, new Set());
      if (r.layout) m.get(r.track)!.add(r.layout);
    }
    return m;
  }, [rows]);
  const tracks = useMemo(() => Array.from(trackLayoutMap.keys()).sort(), [trackLayoutMap]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTrack, setPickerTrack] = useState<string | null>(null);
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
    // Best lap per driver pr. bilklasse + bane + layout (uanset bil-model)
    const bestByDriver = new Map<string, Row>();
    for (const r of list) {
      const key = `${r.car_class}|${r.track}|${r.layout ?? ""}|${r.user_id ?? `name:${r.driver_name.toLowerCase()}`}`;
      const cur = bestByDriver.get(key);
      if (!cur || r.best_lap_ms < cur.best_lap_ms) bestByDriver.set(key, r);
    }
    // Cap at top 10 per (car_class + track) — kun de hurtigste vises
    const sorted = Array.from(bestByDriver.values()).sort((a, b) => a.best_lap_ms - b.best_lap_ms);
    const countByGroup = new Map<string, number>();
    return sorted.filter((r) => {
      const g = `${r.car_class}|${r.track}`;
      const n = (countByGroup.get(g) ?? 0) + 1;
      countByGroup.set(g, n);
      return n <= 10;
    });
  }, [rows, carClass, track, layout]);

  const handleFiles = async (files: FileList) => {
    if (!user) { toast.error("Log ind for at uploade din egen tid."); return; }
    if (files.length === 0) return;
    setUploading(true);
    try {
      const [{ data: profile, error: pErr }, { data: allProfiles, error: aErr }] = await Promise.all([
        supabase.from("profiles").select("lmu_name, approved").eq("id", user.id).maybeSingle(),
        supabase.from("profiles").select("id,lmu_name").not("lmu_name", "is", null),
      ]);
      if (pErr) throw pErr;
      if (aErr) throw aErr;
      if (!profile?.approved) {
        toast.error("Kun godkendte brugere kan uploade tider. Bed en admin om at godkende din profil.");
        return;
      }
      const lmu = (profile?.lmu_name ?? "").trim().toLowerCase();
      if (!lmu) {
        toast.error("Du mangler at sætte dit LMU-navn på profilen først.");
        return;
      }
      const profiles = (allProfiles ?? []) as Array<{ id: string; lmu_name: string | null }>;

      const xmlFiles = Array.from(files).filter((f) => /\.xml$/i.test(f.name));
      if (xmlFiles.length === 0) {
        toast.warning("Ingen XML-filer fundet.");
        return;
      }

      let totalInserted = 0;
      let totalDuplicates = 0;
      let totalSkippedDrivers = 0;
      let filesProcessed = 0;
      let filesFailed = 0;
      let filesWithoutMe = 0;

      for (const file of xmlFiles) {
        try {
          const text = await file.text();
          const parsed = parseLmuRaceFile(text);

          let me = parsed.drivers.find((d) => d.name.trim().toLowerCase() === lmu);
          if (!me) {
            let bestScore = 0;
            for (const d of parsed.drivers) {
              const s = nameSimilarity(d.name, lmu);
              if (s >= 0.85 && s > bestScore) { bestScore = s; me = d; }
            }
          }
          if (!me) { filesWithoutMe += 1; continue; }

          const rows = parsed.drivers
            .filter((d) => d.bestLapMs != null)
            .map((d) => {
              const dn = d.name.trim().toLowerCase();
              let matchId: string | null = null;
              const exact = profiles.find((p) => (p.lmu_name ?? "").trim().toLowerCase() === dn);
              if (exact) matchId = exact.id;
              else {
                let bestScore = 0;
                for (const p of profiles) {
                  const s = nameSimilarity(d.name, p.lmu_name ?? "");
                  if (s >= 0.85 && s > bestScore) { bestScore = s; matchId = p.id; }
                }
              }
              if (!matchId) { totalSkippedDrivers += 1; return null; }
              return {
                user_id: matchId,
                driver_name: d.name,
                track: parsed.track,
                layout: parsed.layout,
                car_class: normalizeCarClass(d.carClass),
                car_model: d.carModel,
                best_lap_ms: d.bestLapMs as number,
                source: "user" as const,
                uploaded_by: user.id,
                recorded_at: parsed.recordedAt,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          if (rows.length > 0) {
            const { data: ins, error } = await supabase
              .from("leaderboard_times")
              .upsert(rows, { onConflict: "user_id,track,layout,car_class,recorded_at", ignoreDuplicates: true })
              .select("id");
            if (error) throw error;
            const inserted = ins?.length ?? 0;
            totalInserted += inserted;
            totalDuplicates += rows.length - inserted;
          }
          filesProcessed += 1;
        } catch (err) {
          console.warn("[leaderboard upload]", file.name, err);
          filesFailed += 1;
        }
      }

      const parts: string[] = [];
      parts.push(`${filesProcessed}/${xmlFiles.length} fil${xmlFiles.length === 1 ? "" : "er"} behandlet`);
      parts.push(`${totalInserted} ny${totalInserted === 1 ? "" : "e"} tid${totalInserted === 1 ? "" : "er"}`);
      if (totalDuplicates) parts.push(`${totalDuplicates} dublet${totalDuplicates === 1 ? "" : "ter"} sprunget over`);
      if (filesWithoutMe) parts.push(`${filesWithoutMe} uden dig`);
      if (filesFailed) parts.push(`${filesFailed} fejlede`);
      toast.success(parts.join(" · "));
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke læse filerne");
    } finally {
      setUploading(false);
    }
  };


  const handleDelete = async (id: string) => {
    if (!confirm("Slet denne tid fra leaderboardet?")) return;
    const { error } = await supabase.from("leaderboard_times").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Tid slettet.");
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
  };

  if (!authLoading && !user) {
    return (
      <GuestLock
        title="Leaderboardet kræver login"
        message="Du skal være logget ind som medlem for at se hurtigste omgangstider."
      />
    );
  }

  return (
    <div className="space-y-8">
      <Link to="/lmu/liga" className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tilbage
      </Link>

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Le Mans Ultimate</p>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Hurtigste omgangstider på tværs af alle løb, samlet pr. bane og bilklasse.</p>
      </header>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board" className="gap-2"><Trophy className="h-4 w-4" /> Leaderboard</TabsTrigger>
          <TabsTrigger value="personal" className="gap-2"><UserIcon className="h-4 w-4" /> Personal bedst</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="space-y-8 pt-4">


      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-primary">
              <Upload className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Upload din race-fil</span>
            </div>
            <p className="flex-1 min-w-[12rem] text-xs text-muted-foreground">
              Vælg én eller flere LMU resultat-XML — eller hele <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Results</code>-mappen. Allerede uploadede filer springes automatisk over.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={folderRef}
              type="file"
              // @ts-expect-error — non-standard but supported in Chromium/Edge
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {user ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
                  <Upload className="h-4 w-4" /> {uploading ? "Læser…" : "Vælg filer"}
                </Button>
                <Button variant="outline" onClick={() => folderRef.current?.click()} disabled={uploading} className="gap-2">
                  <Upload className="h-4 w-4" /> Vælg mappe
                </Button>
              </div>
            ) : (
              <Button asChild><Link to="/login">Log ind for at uploade</Link></Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Filerne ligger i:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              Documents\My Games\LeMansUltimate\UserData\Log\Results
            </code>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Bemærk: kun godkendte brugere kan uploade race-filer. Alle kan se leaderboardet.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-2 text-primary">
            <Monitor className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">Desktop Companion</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Download companion-appen, dobbeltklik installeren og log ind én gang. Derefter starter den automatisk ved Windows-opstart, kører i baggrunden og uploader dine tider når du har kørt i LMU.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Button asChild className="gap-2">
              <a href={COMPANION_DOWNLOAD_URL}>
                <Upload className="h-4 w-4" /> Download til Windows
              </a>
            </Button>
            <span className="text-[11px] text-muted-foreground">Officiel installer · .exe · auto-bygget fra GitHub</span>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Filter className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Filtre</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
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
            <Label className="text-xs">Bane / layout</Label>
            <Popover
              open={pickerOpen}
              onOpenChange={(o) => {
                setPickerOpen(o);
                if (!o) setPickerTrack(null);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm transition hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <span className="truncate">
                    {track === ALL
                      ? "Alle baner"
                      : layout === ALL
                        ? `${displayTrackName(track)} · alle layouts`
                        : `${displayTrackName(track)} · ${layout}`}
                  </span>
                  <ChevronRight className="ml-2 h-4 w-4 shrink-0 rotate-90 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] max-h-[60vh] overflow-y-auto p-1">
                {pickerTrack === null ? (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => {
                        setTrack(ALL);
                        setLayout(ALL);
                        setPickerOpen(false);
                      }}
                      className="flex items-center justify-between rounded-sm px-2 py-2 text-sm hover:bg-accent"
                    >
                      <span>Alle baner</span>
                      {track === ALL && <Check className="h-4 w-4 text-primary" />}
                    </button>
                    {tracks.map((t) => {
                      const tLayouts = Array.from(trackLayoutMap.get(t) ?? []);
                      const hasMultiple = tLayouts.length > 1;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            if (hasMultiple) {
                              setPickerTrack(t);
                            } else {
                              setTrack(t);
                              setLayout(tLayouts[0] ?? ALL);
                              setPickerOpen(false);
                            }
                          }}
                          className="flex items-center justify-between rounded-sm px-2 py-2 text-sm hover:bg-accent"
                        >
                          <span className="truncate">{displayTrackName(t)}</span>
                          <span className="ml-2 flex items-center gap-1 text-muted-foreground">
                            {track === t && <Check className="h-4 w-4 text-primary" />}
                            {hasMultiple && <ChevronRight className="h-4 w-4" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => setPickerTrack(null)}
                      className="flex items-center gap-2 rounded-sm px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> {displayTrackName(pickerTrack)}
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      onClick={() => {
                        setTrack(pickerTrack);
                        setLayout(ALL);
                        setPickerOpen(false);
                        setPickerTrack(null);
                      }}
                      className="flex items-center justify-between rounded-sm px-2 py-2 text-sm hover:bg-accent"
                    >
                      <span>Alle layouts</span>
                      {track === pickerTrack && layout === ALL && <Check className="h-4 w-4 text-primary" />}
                    </button>
                    {Array.from(trackLayoutMap.get(pickerTrack) ?? []).sort().map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => {
                          setTrack(pickerTrack);
                          setLayout(l);
                          setPickerOpen(false);
                          setPickerTrack(null);
                        }}
                        className="flex items-center justify-between rounded-sm px-2 py-2 text-sm hover:bg-accent"
                      >
                        <span className="truncate">{l}</span>
                        {track === pickerTrack && layout === l && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
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
                    {isAdmin && <th className="px-3 py-2 w-10"></th>}
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
                      <td className="px-3 py-2"><Badge variant="outline" className={`text-[10px] ${classColor(r.car_class).badge}`}>{r.car_class}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">{r.car_model ?? "–"}</td>
                      <td className="px-3 py-2"><span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" />{displayTrackName(r.track)}</span></td>
                      <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{r.layout ?? "–"}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3 text-primary" />{msToLapStr(r.best_lap_ms)}</span>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell text-center">
                        <Badge variant={r.source === "admin" ? "default" : "outline"} className="text-[10px]">
                          {r.source === "admin" ? "Officielt løb" : "Bruger"}
                        </Badge>
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(r.id)}
                            title="Slet tid"
                            aria-label="Slet tid"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
        </TabsContent>

        <TabsContent value="personal" className="pt-4">
          <PersonalBestPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

