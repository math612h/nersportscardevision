import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, X, User as UserIcon, GitCompare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMyArchive } from "@/lib/rating.functions";
import { classColor, CARS_BY_CLASS } from "@/lib/lmu-cars";
import { normalizeTrackName } from "@/lib/tracks";

function fmtLap(ms: number | null | undefined) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(3, "0")}`;
}

function fmtDiff(ms: number) {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : "";
  const abs = Math.abs(ms);
  const s = Math.floor(abs / 1000);
  const cs = Math.floor(abs % 1000);
  return `${sign}${s}.${String(cs).padStart(3, "0")}`;
}

type BestRow = {
  track: string;
  layout: string | null;
  car_class: string;
  car_model: string | null;
  best_lap_ms: number;
  recorded_at: string | null;
};

type ProfileHit = { id: string; display_name: string | null; lmu_name: string | null };

const CLASS_ORDER = Object.keys(CARS_BY_CLASS);

function ClassFilter({
  classes,
  value,
  onChange,
}: {
  classes: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          value === null
            ? "bg-foreground text-background border-foreground"
            : "bg-background text-muted-foreground hover:bg-accent",
        )}
      >
        Alle
      </button>
      {classes.map((c) => {
        const col = classColor(c);
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(active ? null : c)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-all",
              col.badge,
              active ? "ring-2 ring-offset-1 ring-offset-background scale-[1.02]" : "opacity-70 hover:opacity-100",
            )}
            style={active ? { boxShadow: "inset 0 0 0 1px currentColor" } : undefined}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function BestTable({ rows }: { rows: BestRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Ingen tider endnu.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Bane</TableHead>
          <TableHead>Klasse</TableHead>
          <TableHead>Bil</TableHead>
          <TableHead className="text-right">Bedste runde</TableHead>
          <TableHead className="hidden sm:table-cell">Sat</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((b, i) => (
          <TableRow key={i}>
            <TableCell className="font-medium">{b.track}{b.layout ? ` (${b.layout})` : ""}</TableCell>
            <TableCell><Badge variant="outline" className={`text-[10px] ${classColor(b.car_class).badge}`}>{b.car_class}</Badge></TableCell>
            <TableCell className="text-muted-foreground">{b.car_model ?? "—"}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{fmtLap(b.best_lap_ms)}</TableCell>
            <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
              {b.recorded_at ? new Date(b.recorded_at).toLocaleDateString("da-DK") : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

type CompareRow = {
  track: string;
  layout: string | null;
  car_class: string;
  mine: BestRow | null;
  other: BestRow | null;
};

function CompareTable({ rows, otherLabel }: { rows: CompareRow[]; otherLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Ingen overlappende tider.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Bane</TableHead>
          <TableHead>Klasse</TableHead>
          <TableHead className="text-right">Mig</TableHead>
          <TableHead className="text-right">{otherLabel}</TableHead>
          <TableHead className="text-right">Diff</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => {
          const diff =
            r.mine && r.other ? r.mine.best_lap_ms - r.other.best_lap_ms : null;
          return (
            <TableRow key={i}>
              <TableCell className="font-medium">{r.track}{r.layout ? ` (${r.layout})` : ""}</TableCell>
              <TableCell>
                <Badge variant="outline" className={`text-[10px] ${classColor(r.car_class).badge}`}>{r.car_class}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{fmtLap(r.mine?.best_lap_ms)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{fmtLap(r.other?.best_lap_ms)}</TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono tabular-nums text-xs",
                  diff == null
                    ? "text-muted-foreground"
                    : diff < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : diff > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground",
                )}
              >
                {diff == null ? "—" : fmtDiff(diff)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function DriverSearch({ onSelect, placeholder }: { onSelect: (p: ProfileHit) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data: hits } = useQuery({
    queryKey: ["pb-driver-search", q.trim().toLowerCase()],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const term = `%${q.trim()}%`;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, lmu_name")
        .or(`display_name.ilike.${term},lmu_name.ilike.${term}`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as ProfileHit[];
    },
  });

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder ?? "Søg efter en kører (navn eller LMU-navn)…"}
          className="pl-8"
        />
      </div>
      {open && q.trim().length >= 2 && hits && hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(p); setQ(""); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{p.display_name ?? p.lmu_name ?? "Ukendt"}</span>
              {p.lmu_name && p.display_name && p.lmu_name !== p.display_name && (
                <span className="text-xs text-muted-foreground">· {p.lmu_name}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && hits && hits.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
          Ingen kørere fundet.
        </div>
      )}
    </div>
  );
}

function useDriverBests(userId: string | null) {
  return useQuery({
    queryKey: ["pb-driver-bests", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard_times")
        .select("track,layout,car_class,car_model,best_lap_ms,recorded_at,created_at")
        .eq("user_id", userId!)
        .order("best_lap_ms", { ascending: true });
      if (error) throw error;
      const map = new Map<string, BestRow>();
      for (const t of (data ?? []) as any[]) {
        const normTrack = normalizeTrackName(t.track) || t.track;
        const key = `${normTrack}|${t.layout ?? ""}|${t.car_class}`;
        const cur = map.get(key);
        if (!cur || t.best_lap_ms < cur.best_lap_ms) {
          map.set(key, {
            track: normTrack,
            layout: t.layout,
            car_class: t.car_class,
            car_model: t.car_model,
            best_lap_ms: t.best_lap_ms,
            recorded_at: t.recorded_at ?? t.created_at,
          });
        }
      }
      return Array.from(map.values()).sort((a, b) =>
        a.car_class.localeCompare(b.car_class) || a.track.localeCompare(b.track),
      );
    },
  });
}

export function PersonalBestPanel() {
  const { user } = useAuth();
  const fetchArchive = useServerFn(getMyArchive);
  const { data, isLoading } = useQuery({
    queryKey: ["my-archive-leaderboard", user?.id],
    enabled: !!user,
    queryFn: () => fetchArchive(),
  });

  const [selected, setSelected] = useState<ProfileHit | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareWith, setCompareWith] = useState<ProfileHit | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);

  const { data: otherBests, isLoading: loadingOther } = useDriverBests(selected?.id ?? null);
  const { data: compareBests, isLoading: loadingCompare } = useDriverBests(compareWith?.id ?? null);

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">Log ind</Link> for at se personlige bedste tider.
        </CardContent>
      </Card>
    );
  }

  const myBest = (data?.best ?? []) as BestRow[];
  const viewedBests: BestRow[] = selected ? (otherBests ?? []) : myBest;
  const filteredViewed = classFilter ? viewedBests.filter((r) => r.car_class === classFilter) : viewedBests;

  // Build compare rows by union of (track|layout|class)
  const compareRows: CompareRow[] = useMemo(() => {
    if (!compareMode || !compareWith) return [];
    const keyOf = (r: BestRow) => `${r.track}|${r.layout ?? ""}|${r.car_class}`;
    const mineMap = new Map<string, BestRow>();
    for (const r of myBest) mineMap.set(keyOf(r), r);
    const otherMap = new Map<string, BestRow>();
    for (const r of (compareBests ?? [])) otherMap.set(keyOf(r), r);
    const keys = new Set([...mineMap.keys(), ...otherMap.keys()]);
    const rows: CompareRow[] = [];
    for (const k of keys) {
      const m = mineMap.get(k) ?? null;
      const o = otherMap.get(k) ?? null;
      const ref = m ?? o!;
      rows.push({ track: ref.track, layout: ref.layout, car_class: ref.car_class, mine: m, other: o });
    }
    return rows
      .filter((r) => !classFilter || r.car_class === classFilter)
      .sort((a, b) => a.car_class.localeCompare(b.car_class) || a.track.localeCompare(b.track));
  }, [compareMode, compareWith, myBest, compareBests, classFilter]);

  const inCompare = compareMode && !selected;
  const otherLabel = compareWith?.display_name ?? compareWith?.lmu_name ?? "Modstander";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>
                {selected
                  ? `${selected.display_name ?? selected.lmu_name}'s bedste tider`
                  : inCompare
                    ? "Sammenlign tider"
                    : "Mine personlige bedste tider"}
              </CardTitle>
              <CardDescription>
                {selected
                  ? "Hurtigste runde pr. bane og bilklasse for den valgte kører."
                  : inCompare
                    ? "Vælg en kører for at sammenligne dine bedste tider."
                    : "Din hurtigste runde pr. bane og bilklasse, uanset session."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {!selected && (
                <Button
                  variant={compareMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setCompareMode((v) => !v);
                    if (compareMode) setCompareWith(null);
                  }}
                  className="gap-1"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  {compareMode ? "Luk compare" : "Compare"}
                </Button>
              )}
              {selected && (
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="gap-1">
                  <X className="h-3.5 w-3.5" /> Tilbage til mine
                </Button>
              )}
            </div>
          </div>

          {!compareMode && <DriverSearch onSelect={setSelected} />}

          {inCompare && (
            compareWith ? (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">Sammenligner med {otherLabel}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCompareWith(null)} className="gap-1">
                  <X className="h-3.5 w-3.5" /> Skift
                </Button>
              </div>
            ) : (
              <DriverSearch onSelect={setCompareWith} placeholder="Vælg kører at sammenligne med…" />
            )
          )}

          <ClassFilter classes={CLASS_ORDER} value={classFilter} onChange={setClassFilter} />
        </CardHeader>
        <CardContent>
          {inCompare ? (
            !compareWith ? (
              <p className="text-sm text-muted-foreground">Vælg en kører ovenfor for at se sammenligningen.</p>
            ) : loadingCompare ? (
              <p className="text-sm text-muted-foreground">Indlæser…</p>
            ) : (
              <CompareTable rows={compareRows} otherLabel={otherLabel} />
            )
          ) : selected ? (
            loadingOther ? (
              <p className="text-sm text-muted-foreground">Indlæser…</p>
            ) : (
              <BestTable rows={filteredViewed} />
            )
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Indlæser…</p>
          ) : (
            <BestTable rows={filteredViewed} />
          )}
        </CardContent>
      </Card>
      {!selected && !compareMode && (
        <p className="text-xs text-muted-foreground">
          Vil du se din udvikling over tid og dine liga-resultater? <Link to="/arkiv" className="text-primary hover:underline">Åbn det fulde arkiv →</Link>
        </p>
      )}
    </div>
  );
}
