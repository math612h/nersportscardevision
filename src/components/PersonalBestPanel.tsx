import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, X, User as UserIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMyArchive } from "@/lib/rating.functions";

function fmtLap(ms: number | null | undefined) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(3, "0")}`;
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
            <TableCell><Badge variant="secondary" className="text-[10px]">{b.car_class}</Badge></TableCell>
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

function DriverSearch({ onSelect }: { onSelect: (p: ProfileHit) => void }) {
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
          placeholder="Søg efter en kører (navn eller LMU-navn)…"
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
        const key = `${t.track}|${t.layout ?? ""}|${t.car_class}`;
        const cur = map.get(key);
        if (!cur || t.best_lap_ms < cur.best_lap_ms) {
          map.set(key, {
            track: t.track,
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
  const { data: otherBests, isLoading: loadingOther } = useDriverBests(selected?.id ?? null);

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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>
                {selected ? `${selected.display_name ?? selected.lmu_name}'s bedste tider` : "Mine personlige bedste tider"}
              </CardTitle>
              <CardDescription>
                {selected
                  ? "Hurtigste runde pr. bane og bilklasse for den valgte kører."
                  : "Din hurtigste runde pr. bane og bilklasse, uanset session."}
              </CardDescription>
            </div>
            {selected && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="gap-1">
                <X className="h-3.5 w-3.5" /> Tilbage til mine
              </Button>
            )}
          </div>
          <DriverSearch onSelect={setSelected} />
        </CardHeader>
        <CardContent>
          {selected ? (
            loadingOther ? (
              <p className="text-sm text-muted-foreground">Indlæser…</p>
            ) : (
              <BestTable rows={otherBests ?? []} />
            )
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Indlæser…</p>
          ) : (
            <BestTable rows={myBest} />
          )}
        </CardContent>
      </Card>
      {!selected && (
        <p className="text-xs text-muted-foreground">
          Vil du se din udvikling over tid og dine liga-resultater? <Link to="/arkiv" className="text-primary hover:underline">Åbn det fulde arkiv →</Link>
        </p>
      )}
    </div>
  );
}
