import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Calendar, BookOpen, ArrowLeft, MapPin, UserPlus, UserMinus, Users, Trophy, ArrowUpRight, Zap } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { leaveLeague } from "@/lib/leagues.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { WEATHER_BY_KEY, type WeatherKey, type ClassConfig, getTrackImageFile } from "@/lib/tracks";

export const Route = createFileRoute("/ligaer/$leagueId/")({
  component: LeagueDetail,
});

function LeagueDetail() {
  const { leagueId } = useParams({ from: "/ligaer/$leagueId/" });

  const { data: league } = useQuery({
    queryKey: ["league", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: divisions } = useQuery({
    queryKey: ["divisions", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("*, entries(count)")
        .eq("league_id", leagueId)
        .order("race_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const configs: ClassConfig[] = Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];

  const trackFiles = useMemo(() => {
    const set = new Set<string>();
    (divisions ?? []).forEach((d: any) => { const f = getTrackImageFile(d.track); if (f) set.add(f); });
    return Array.from(set);
  }, [divisions]);

  const { data: imageMap } = useQuery({
    queryKey: ["track-image-urls", trackFiles.sort().join(",")],
    enabled: trackFiles.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("track-images").createSignedUrls(trackFiles, 60 * 60 * 24 * 7);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => { if (d.path && d.signedUrl) m[d.path] = d.signedUrl; });
      return m;
    },
  });

  return (
    <div className="space-y-8">
      <Link to="/lmu" className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Alle ligaer
      </Link>

      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {(league as any)?.is_offseason ? "Off-Season event" : "Liga"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{league?.name}</h1>
          {league?.description && <p className="text-sm text-muted-foreground">{league.description}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {configs.length > 0
            ? configs.map((c, i) => (
                <Badge key={i} variant="outline">{c.car_class} {c.driver_category} · #{c.number_from}-{c.number_to}</Badge>
              ))
            : (<>
                {(league as any)?.car_class && <Badge>{(league as any).car_class}</Badge>}
                {(league as any)?.driver_category && <Badge variant="secondary">{(league as any).driver_category}</Badge>}
              </>)}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link to="/ligaer/$leagueId/regler" params={{ leagueId }}>
            <Button variant="outline" size="sm" className="gap-2"><BookOpen className="h-4 w-4" /> Se regelsæt</Button>
          </Link>
          {league && <SignupDialog leagueId={leagueId} configs={configs} />}
        </div>
      </header>

      <QuickNav />

      {league && <SignupsList leagueId={leagueId} configs={configs} />}

      <section id="kalender" className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Calendar className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Afdelinger</h2>
        </div>
        {divisions?.length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen afdelinger oprettet endnu.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {divisions?.map((d: any) => {
            const slots: WeatherKey[] = Array.isArray(d.settings?.weather) ? d.settings.weather : [];
            const completed = !!d.settings?.completed;
            const imgFile = getTrackImageFile(d.track);
            const imgUrl = imgFile ? imageMap?.[imgFile] : null;
            return (
              <Link
                key={d.id}
                to="/ligaer/$leagueId/afdeling/$divisionId"
                params={{ leagueId, divisionId: d.id }}
                className="group block h-full"
              >
                <Card className="flex h-full flex-col overflow-hidden border-border transition hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]">
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                    {imgUrl ? (
                      <img src={imgUrl} alt={d.track ?? d.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-transparent" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
                    <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </div>
                    {completed && (
                      <Badge variant="secondary" className="absolute left-3 top-3 text-[10px]">Afsluttet</Badge>
                    )}
                  </div>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{d.name}</CardTitle>
                    {d.track && (
                      <CardDescription className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{d.track}{d.layout ? ` · ${d.layout}` : ""}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="mt-auto space-y-2 pt-0">
                    <div className="flex flex-wrap gap-2">
                      {d.race_date && (
                        <Badge variant="outline" className="gap-1">
                          <Calendar className="h-3 w-3" /> {format(new Date(d.race_date), "dd MMM yyyy HH:mm")}
                        </Badge>
                      )}
                      <Badge variant="outline">{d.entries?.[0]?.count ?? 0} tilmeldt</Badge>
                    </div>
                    {slots.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {slots.map((key, i) => {
                          const w = WEATHER_BY_KEY[key];
                          if (!w) return null;
                          const Icon = w.icon;
                          return <Icon key={i} className="h-4 w-4 text-muted-foreground" aria-label={w.label} />;
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <Standings leagueId={leagueId} configs={configs} />
    </div>
  );
}

function useLeagueSignups(leagueId: string) {
  return useQuery({
    queryKey: ["league-signups", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id,user_id,driver_name,car_class,driver_category,car_number,waitlist,created_at")
        .eq("league_id", leagueId)
        .is("division_id", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}


function SignupsList({ leagueId, configs }: { leagueId: string; configs: ClassConfig[] }) {
  const { data } = useLeagueSignups(leagueId);
  if (!data || data.length === 0) return null;

  const keys = configs.length
    ? configs.map((c) => `${c.car_class} · ${c.driver_category}`)
    : Array.from(new Set(data.map((e) => `${e.car_class} · ${e.driver_category}`)));

  const grouped: Record<string, typeof data> = {};
  for (const k of keys) grouped[k] = [];
  for (const e of data) {
    const k = `${e.car_class} · ${e.driver_category}`;
    (grouped[k] ??= [] as any).push(e);
  }

  return (
    <section id="entryliste" className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Users className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Entryliste</h2>
      </div>
      <div className="space-y-3">
        {Object.entries(grouped).map(([k, list]) => {
          if (!list || list.length === 0) return null;
          const [cls, cat] = k.split(" · ");
          const cfg = configs.find((c) => c.car_class === cls && c.driver_category === cat);
          const grid = list.filter((e) => !e.waitlist).sort((a, b) => (a.car_number ?? 0) - (b.car_number ?? 0));
          const wait = list.filter((e) => e.waitlist).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
          return (
            <Card key={k}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span>{cls}</span>
                  <Badge variant="outline" className="text-[10px]">{cat}</Badge>
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {grid.length}{cfg?.max_drivers ? `/${cfg.max_drivers}` : ""} på grid{wait.length > 0 ? ` · ${wait.length} på venteliste` : ""}
                </span>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <ul className="divide-y divide-border">
                  {grid.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="inline-flex h-7 min-w-9 items-center justify-center rounded bg-muted px-2 font-mono text-xs font-semibold tabular-nums">
                        #{e.car_number}
                      </span>
                      <span className="flex-1 truncate">{e.driver_name}</span>
                    </li>
                  ))}
                </ul>
                {wait.length > 0 && (
                  <div className="rounded-md border border-dashed border-border p-2">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Venteliste</p>
                    <ul className="divide-y divide-border">
                      {wait.map((e, idx) => (
                        <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {idx + 1}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">#{e.car_number}</span>
                          <span className="flex-1 truncate">{e.driver_name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

type ResultRow = {
  car_number: number;
  driver_name: string;
  car_class: string;
  driver_category: string;
  class_position: number;
  points: number;
  fastest_lap?: boolean;
  penalty_seconds?: number;
  penalty_points?: number;
  dns?: boolean;
};

function Standings({ leagueId, configs }: { leagueId: string; configs: ClassConfig[] }) {
  const { data: divisions } = useQuery({
    queryKey: ["league-results", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id,name,settings,race_date")
        .eq("league_id", leagueId)
        .order("race_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const completed = (divisions ?? []).filter((d: any) => d.settings?.completed && Array.isArray(d.settings?.results));

  if (completed.length === 0) {
    return (
      <section id="stillinger" className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Trophy className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Stillinger</h2>
        </div>
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Stillinger vises når der er afholdt løb.
          </CardContent>
        </Card>
      </section>
    );
  }

  type Agg = {
    car_number: number;
    driver_name: string;
    car_class: string;
    driver_category: string;
    race: number;
    fl: number;
    total: number;
    penalty: number;
    pointPenalty: number;
    rounds: Record<string, { points: number; fl: boolean; flPts: number; penalty: number; pointPenalty: number; dns: boolean }>;
  };
  const map = new Map<string, Agg>();
  for (const d of completed as any[]) {
    const flPts = Number(d.settings?.fastest_lap_points ?? 0);
    for (const r of d.settings.results as ResultRow[]) {
      const key = `${r.car_class}|${r.driver_category}|${r.car_number}`;
      const cur = map.get(key) ?? {
        car_number: r.car_number,
        driver_name: r.driver_name,
        car_class: r.car_class,
        driver_category: r.driver_category,
        race: 0,
        fl: 0,
        total: 0,
        penalty: 0,
        pointPenalty: 0,
        rounds: {},
      };
      const earnedFl = r.fastest_lap ? flPts : 0;
      const pen = Number(r.penalty_seconds ?? 0);
      const ptsPen = Math.max(0, Number(r.penalty_points ?? 0));
      cur.race += r.points;
      cur.fl += earnedFl;
      cur.total += Math.max(0, r.points + earnedFl - ptsPen);
      cur.penalty += pen;
      cur.pointPenalty += ptsPen;
      cur.rounds[d.id] = { points: r.points, fl: !!r.fastest_lap, flPts: earnedFl, penalty: pen, pointPenalty: ptsPen, dns: !!r.dns };
      map.set(key, cur);
    }
  }

  const allRows = Array.from(map.values());
  const groupKeys = configs.length
    ? configs.map((c) => `${c.car_class} · ${c.driver_category}`)
    : Array.from(new Set(allRows.map((r) => `${r.car_class} · ${r.driver_category}`)));

  return (
    <section id="stillinger" className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Trophy className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Stillinger</h2>
      </div>
      {groupKeys.map((k) => {
        const [cls, cat] = k.split(" · ");
        const rows = allRows
          .filter((r) => r.car_class === cls && r.driver_category === cat)
          .sort((a, b) => b.total - a.total);
        if (rows.length === 0) return null;
        return (
          <Card key={k}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span>{cls}</span>
                <Badge variant="outline" className="text-[10px]">{cat}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2 w-8">#</th>
                    <th className="py-1 pr-2">Kører</th>
                    <th className="py-1 pr-2 w-12 text-center">Nr.</th>
                    {completed.map((d: any) => (
                      <th key={d.id} className="py-1 px-1 w-12 text-center" title={d.name}>
                        {d.name.slice(0, 4)}
                      </th>
                    ))}
                    <th className="py-1 px-1 w-10 text-center" title="Fastest lap points">FL</th>
                    <th className="py-1 px-1 w-12 text-center" title="Samlet tidsstraf">Straf</th>
                    <th className="py-1 px-1 w-14 text-center" title="Samlet pointstraf">Pt-straf</th>
                    <th className="py-1 pl-2 w-12 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.car_number} className="border-t border-border">
                      <td className="py-1.5 pr-2 font-semibold tabular-nums">{i + 1}</td>
                      <td className="py-1.5 pr-2 truncate">{r.driver_name}</td>
                      <td className="py-1.5 pr-2 text-center font-mono text-xs">{r.car_number}</td>
                      {completed.map((d: any) => {
                        const cell = r.rounds[d.id];
                        if (!cell) return <td key={d.id} className="py-1.5 px-1 text-center text-muted-foreground">–</td>;
                        if (cell.dns) return <td key={d.id} className="py-1.5 px-1 text-center text-[10px] font-semibold text-destructive">DNS</td>;
                        return (
                          <td key={d.id} className="py-1.5 px-1 text-center tabular-nums text-muted-foreground">
                            <span className="relative inline-block">
                              <span>{cell.points}</span>
                              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-0.5 flex items-center gap-0.5">
                                {cell.fl && <Zap className="h-3 w-3 text-primary" aria-label="Fastest lap" />}
                                {cell.penalty > 0 && (
                                  <span className="text-[10px] text-destructive" title={`+${cell.penalty}s tidsstraf`}>+{cell.penalty}s</span>
                                )}
                                {cell.pointPenalty > 0 && (
                                  <span className="text-[10px] text-destructive" title={`-${cell.pointPenalty} pointstraf`}>-{cell.pointPenalty}p</span>
                                )}
                              </span>
                            </span>
                          </td>
                        );

                      })}
                      <td className="py-1.5 px-1 text-center tabular-nums text-muted-foreground">{r.fl || "–"}</td>
                      <td className="py-1.5 px-1 text-center tabular-nums text-destructive">{r.penalty > 0 ? `+${r.penalty}s` : "–"}</td>
                      <td className="py-1.5 px-1 text-center tabular-nums text-destructive">{r.pointPenalty > 0 ? `-${r.pointPenalty}` : "–"}</td>
                      <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}


function SignupDialog({ leagueId, configs }: { leagueId: string; configs: ClassConfig[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: signups } = useLeagueSignups(leagueId);
  const [open, setOpen] = useState(false);
  const [cfgIdx, setCfgIdx] = useState<string>("0");
  const [carNumber, setCarNumber] = useState<number | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name,lmu_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { display_name: string | null; lmu_name: string | null } | null;
    },
  });

  const driverName = (profile?.display_name ?? user?.email?.split("@")[0] ?? "").trim();
  const existingLmu = (profile?.lmu_name ?? "").trim();
  const [lmuInput, setLmuInput] = useState("");
  const effectiveLmu = (existingLmu || lmuInput).trim();

  const alreadySignedUp = !!user && (signups ?? []).some((s) => s.user_id === user.id);
  const selected = configs[Number(cfgIdx)];

  const { taken, available } = useMemo(() => {
    if (!selected) return { taken: [] as number[], available: [] as number[] };
    const t = (signups ?? [])
      .filter((s) => s.car_class === selected.car_class && s.driver_category === selected.driver_category && s.car_number != null)
      .map((s) => s.car_number as number);
    const a: number[] = [];
    for (let n = selected.number_from; n <= selected.number_to; n++) if (!t.includes(n)) a.push(n);
    return { taken: t, available: a };
  }, [signups, selected]);

  const gridCount = (signups ?? []).filter(
    (s) => selected && s.car_class === selected.car_class && s.driver_category === selected.driver_category && !s.waitlist,
  ).length;
  const cap = selected?.max_drivers ?? null;
  const goesToWaitlist = cap != null && gridCount >= cap;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Du skal være logget ind.");
    if (!selected) return toast.error("Vælg en klasse.");
    if (carNumber == null) return toast.error("Vælg et kørenummer.");
    if (!driverName) return toast.error("Dit kørernavn mangler på profilen.");
    if (!effectiveLmu) return toast.error("Indtast dit LMU-navn præcis som det står i spillet.");

    // Persist LMU name on profile if user just provided it
    if (!existingLmu && lmuInput.trim()) {
      const { error: pErr } = await supabase.from("profiles").update({ lmu_name: lmuInput.trim() }).eq("id", user.id);
      if (pErr) return toast.error(`Kunne ikke gemme LMU-navn: ${pErr.message}`);
    }

    const { error } = await supabase.from("entries").insert({
      league_id: leagueId,
      user_id: user.id,
      driver_name: driverName,
      car_class: selected.car_class,
      driver_category: selected.driver_category,
      car_number: carNumber,
      waitlist: goesToWaitlist,
    });
    if (error) return toast.error(error.message);
    toast.success(goesToWaitlist ? "Klassen er fyldt – du er tilføjet til ventelisten." : "Du er tilmeldt!");
    setOpen(false);
    setCarNumber(null);
    qc.invalidateQueries({ queryKey: ["league-signups", leagueId] });
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  };


  if (!user) {
    return <Button asChild size="sm" className="gap-2"><Link to="/login">Log ind for at tilmelde</Link></Button>;
  }
  if (configs.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={alreadySignedUp}>
          <UserPlus className="h-4 w-4" /> {alreadySignedUp ? "Du er tilmeldt" : "Tilmeld dig"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tilmeld dig {league_name(leagueId)}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Kørernavn</Label>
            <Input value={driverName} disabled readOnly />
            <p className="mt-1 text-xs text-muted-foreground">Hentet fra din profil.</p>
          </div>
          <div>
            <Label>LMU-navn</Label>
            <Input
              value={existingLmu || lmuInput}
              onChange={(e) => setLmuInput(e.target.value)}
              disabled={!!existingLmu}
              readOnly={!!existingLmu}
              placeholder="Som det står i Le Mans Ultimate"
              required
              maxLength={80}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {existingLmu
                ? "Gemt på din profil – bruges til at koble løbsresultater til din konto."
                : "Skriv dit navn præcis som det står i spillet. Bruges til at matche dig i resultatfiler."}
            </p>
          </div>
          <div>
            <Label>Bilklasse</Label>
            <Select value={cfgIdx} onValueChange={(v) => { setCfgIdx(v); setCarNumber(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {configs.map((c, i) => (
                  <SelectItem key={i} value={String(i)}>{c.car_class} · {c.driver_category} (#{c.number_from}-{c.number_to})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected && goesToWaitlist && (
            <p className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              Klassen er fyldt ({gridCount}/{cap}). Du tilmeldes ventelisten og rykker op automatisk, hvis en plads bliver ledig.
            </p>
          )}
          {selected && (
            <div className="space-y-2">
              <Label>Kørenummer</Label>
              <div className="grid grid-cols-8 gap-1 rounded-md border border-border p-2 max-h-48 overflow-y-auto">
                {Array.from({ length: selected.number_to - selected.number_from + 1 }, (_, i) => selected.number_from + i).map((n) => {
                  const isTaken = taken.includes(n);
                  const isSel = carNumber === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={isTaken}
                      onClick={() => setCarNumber(n)}
                      className={`rounded px-1 py-1 text-xs ${isTaken ? "bg-muted text-muted-foreground line-through cursor-not-allowed" : isSel ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"}`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{available.length} ledige · {taken.length} optaget</p>
            </div>
          )}
          <DialogFooter><Button type="submit" disabled={carNumber == null}>{goesToWaitlist ? "Tilmeld til venteliste" : "Tilmeld"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickNav() {
  const items = [
    { id: "entryliste", label: "Entryliste", icon: Users },
    { id: "kalender", label: "Kalender", icon: Calendar },
    { id: "stillinger", label: "Stillinger", icon: Trophy },
  ];

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollTo(item.id)}
          className="group flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <item.icon className="h-4 w-4" />
          </span>
          <span className="truncate text-xs font-medium">{item.label}</span>
        </button>
      ))}
    </div>
  );
}


function league_name(_id: string) {
  return "ligaen";
}
