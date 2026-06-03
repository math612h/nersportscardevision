import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Trophy, Upload, Timer, MapPin, Filter, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseLmuRaceFile, normalizeCarClass, msToLapStr, CAR_CLASS_OPTIONS, nameSimilarity } from "@/lib/lmu-parser";
import { DriverLink } from "@/components/DriverLink";

const LB_TITLE = "Leaderboard — hurtigste omgangstider i Le Mans Ultimate";
const LB_DESC =
  "Hurtigste omgangstider pr. bane og bilklasse på tværs af alle NER Sportscar Division-løb i Le Mans Ultimate. Upload din race-fil og kom på listen.";
const LB_URL = "https://nersportscardevision.lovable.app/leaderboard";

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
          name: "NER Sportscar Division — Le Mans Ultimate leaderboard",
          description: LB_DESC,
          url: LB_URL,
          creator: { "@type": "Organization", name: "NER Sportscar Division" },
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
  source: "admin" | "user";
  recorded_at: string | null;
  created_at: string;
};

const ALL = "__all__";

function LeaderboardPage() {
  const { user, isAdmin } = useAuth();
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

      // Look up the uploader's profile (must be approved) + all known LMU names for matching
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

      // Confirm uploader is in the file (exact or fuzzy ≥85%)
      let me = parsed.drivers.find((d) => d.name.trim().toLowerCase() === lmu);
      if (!me) {
        let bestScore = 0;
        for (const d of parsed.drivers) {
          const s = nameSimilarity(d.name, lmu);
          if (s > bestScore) { bestScore = s; me = s >= 0.85 ? d : me; }
        }
      }
      if (!me) {
        toast.error(`Dit navn “${profile!.lmu_name}” findes ikke i filen. Tjek at det matcher (mindst 85%).`);
        return;
      }

      // Match every driver in the file against known profiles — only registered users land on the leaderboard
      const profiles = (allProfiles ?? []) as Array<{ id: string; lmu_name: string | null }>;
      const allParsed = parsed.drivers.filter((d) => d.bestLapMs != null);
      const skipped: string[] = [];
      const rows = allParsed
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
          if (!matchId) { skipped.push(d.name); return null; }
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

      if (rows.length === 0) {
        toast.warning("Ingen af kørerne i filen er registreret i app'en — intet uploadet.");
        return;
      }

      const { error } = await supabase.from("leaderboard_times").insert(rows);
      if (error) throw error;

      toast.success(
        `${rows.length} tid${rows.length === 1 ? "" : "er"} uploadet fra ${parsed.track}${parsed.layout ? ` (${parsed.layout})` : ""}${skipped.length ? ` — ${skipped.length} ukendt${skipped.length === 1 ? "" : "e"} kører${skipped.length === 1 ? "" : "e"} sprunget over.` : "."}`,
      );
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke læse filen");
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
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-primary">
              <Upload className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Upload din race-fil</span>
            </div>
            <p className="flex-1 min-w-[12rem] text-xs text-muted-foreground">
              Upload en LMU resultat-XML — alle genkendte kørere i filen får automatisk deres tider lagt på leaderboardet (matchet via LMU-navn).
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
    </div>
  );
}
