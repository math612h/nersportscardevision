import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, ArrowLeftRight, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { approveEntry } from "@/lib/leagues.functions";
import { CAR_CLASSES, DRIVER_CATEGORIES } from "@/lib/tracks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer/$leagueId/entries")({
  component: AdminEntries,
});

function AdminEntries() {
  const { leagueId } = useParams({ from: "/_authenticated/_admin/admin/ligaer/$leagueId/entries" });
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["entries-admin", leagueId],
    queryFn: async () => {
      const { data: divisions, error: divisionsError } = await supabase.from("divisions").select("id,name").eq("league_id", leagueId);
      if (divisionsError) throw divisionsError;
      const divisionIds = (divisions ?? []).map((d) => d.id);
      const divisionNames = new Map((divisions ?? []).map((d) => [d.id, d.name]));

      // Fetch entries belonging to this league directly OR to any of its divisions
      const orFilter = divisionIds.length > 0
        ? `league_id.eq.${leagueId},division_id.in.(${divisionIds.join(",")})`
        : `league_id.eq.${leagueId}`;
      const { data: entries, error: entriesError } = await supabase
        .from("entries")
        .select("*")
        .or(orFilter)
        .order("created_at");
      if (entriesError) throw entriesError;
      return (entries ?? []).map((entry) => ({
        ...entry,
        divisionName: entry.division_id ? (divisionNames.get(entry.division_id) ?? "Ukendt") : "Liga-tilmelding",
      }));
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("entries").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Fjernet"); qc.invalidateQueries({ queryKey: ["entries-admin", leagueId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useServerFn(approveEntry);
  const approveMut = useMutation({
    mutationFn: async (entryId: string) => approve({ data: { entryId } }),
    onSuccess: (res) => {
      toast.success(res.alreadyApproved ? "Allerede godkendt" : "Godkendt – kører har fået besked");
      qc.invalidateQueries({ queryKey: ["entries-admin", leagueId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // Group by division → class → category
  const grouped = (data ?? []).reduce<Record<string, Record<string, Record<string, any[]>>>>((acc, e: any) => {
    const div = e.divisionName ?? "Ukendt";
    acc[div] ??= {};
    acc[div][e.car_class] ??= {};
    acc[div][e.car_class][e.driver_category] ??= [];
    acc[div][e.car_class][e.driver_category].push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Link to="/admin/ligaer" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-3 w-3" /> Ligaer</Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Entries</h1>
        <EntryDialog leagueId={leagueId} onDone={() => qc.invalidateQueries({ queryKey: ["entries-admin", leagueId] })} />
      </div>
      {Object.keys(grouped).length === 0 && <p className="text-muted-foreground">Ingen tilmeldinger endnu.</p>}
      {Object.entries(grouped).map(([div, classes]) => (
        <Card key={div}>
          <CardHeader><CardTitle className="text-base">{div}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(classes).map(([cls, cats]) => (
              <div key={cls}>
                <p className="text-sm font-medium">{cls}</p>
                {Object.entries(cats).map(([cat, list]) => (
                  <div key={cat} className="ml-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{cat}</p>
                    <ul className="space-y-1">
                      {list.map((e) => (
                        <li key={e.id} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm">
                          <span className="flex items-center gap-2">
                            {e.car_number != null && (
                              <span className="inline-flex h-6 min-w-8 items-center justify-center rounded bg-muted px-1.5 font-mono text-xs">#{e.car_number}</span>
                            )}
                            {e.driver_name}
                          </span>
                          <div className="flex items-center gap-1">
                            <MoveEntryDialog entry={e} leagueId={leagueId} allEntries={data ?? []} onDone={() => qc.invalidateQueries({ queryKey: ["entries-admin", leagueId] })} />
                            <Button variant="ghost" size="sm" onClick={() => del.mutate(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EntryDialog({ leagueId, onDone }: { leagueId: string; onDone: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [divisionId, setDivisionId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [carClass, setCarClass] = useState<string>(CAR_CLASSES[0]);
  const [category, setCategory] = useState<string>(DRIVER_CATEGORIES[0]);

  const { data: divisions } = useQuery({
    queryKey: ["entry-divisions", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("divisions").select("id,name,car_class,driver_category").eq("league_id", leagueId).order("race_date");
      if (error) throw error;
      return data;
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Du skal være logget ind.");
    if (!divisionId) return toast.error("Vælg en afdeling.");
    const { error } = await supabase.from("entries").insert({
      division_id: divisionId,
      user_id: user.id,
      driver_name: driverName.trim(),
      car_class: carClass,
      driver_category: category,
    });
    if (error) return toast.error(error.message);
    toast.success("Entry tilføjet");
    setOpen(false);
    setDivisionId("");
    setDriverName("");
    onDone();
  };

  const chooseDivision = (id: string) => {
    setDivisionId(id);
    const division = divisions?.find((d) => d.id === id);
    if (division?.car_class) setCarClass(division.car_class);
    if (division?.driver_category) setCategory(division.driver_category);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Ny entry</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Tilføj entry</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Afdeling</Label>
            <Select value={divisionId} onValueChange={chooseDivision}>
              <SelectTrigger><SelectValue placeholder="Vælg afdeling" /></SelectTrigger>
              <SelectContent>{divisions?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Kørernavn</Label><Input required maxLength={80} value={driverName} onChange={(e) => setDriverName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Bilklasse</Label>
              <Select value={carClass} onValueChange={setCarClass}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CAR_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DRIVER_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button type="submit">Tilføj</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type EntryRow = {
  id: string;
  driver_name: string;
  car_class: string;
  driver_category: string;
  car_number: number | null;
};

function MoveEntryDialog({ entry, leagueId, allEntries, onDone }: { entry: EntryRow; leagueId: string; allEntries: EntryRow[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [carClass, setCarClass] = useState(entry.car_class);
  const [category, setCategory] = useState(entry.driver_category);
  const [carNumber, setCarNumber] = useState<number | null>(entry.car_number);

  const { data: league } = useQuery({
    queryKey: ["league-configs", leagueId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("class_configs").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

  const configs: Array<{ car_class: string; driver_category: string; number_from: number; number_to: number }> =
    Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];

  const selected = configs.find((c) => c.car_class === carClass && c.driver_category === category);

  const { taken, available } = useMemo(() => {
    if (!selected) return { taken: [] as number[], available: [] as number[] };
    const t = allEntries
      .filter((s) => s.id !== entry.id && s.car_class === selected.car_class && s.driver_category === selected.driver_category && s.car_number != null)
      .map((s) => s.car_number as number);
    const a: number[] = [];
    for (let n = selected.number_from; n <= selected.number_to; n++) if (!t.includes(n)) a.push(n);
    return { taken: t, available: a };
  }, [allEntries, selected, entry.id]);

  const pickConfig = (key: string) => {
    const c = configs[Number(key)];
    if (!c) return;
    setCarClass(c.car_class);
    setCategory(c.driver_category);
    // reset number if outside new range or conflicting
    if (carNumber == null || carNumber < c.number_from || carNumber > c.number_to) setCarNumber(null);
  };

  const cfgIdx = configs.findIndex((c) => c.car_class === carClass && c.driver_category === category);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (carNumber == null) return toast.error("Vælg et kørenummer.");
    const { error } = await supabase
      .from("entries")
      .update({ car_class: carClass, driver_category: category, car_number: carNumber })
      .eq("id", entry.id);
    if (error) return toast.error(error.message);
    toast.success("Flyttet");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Flyt"><ArrowLeftRight className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Flyt {entry.driver_name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {configs.length > 0 ? (
            <div>
              <Label>Klasse · kategori</Label>
              <Select value={cfgIdx >= 0 ? String(cfgIdx) : ""} onValueChange={pickConfig}>
                <SelectTrigger><SelectValue placeholder="Vælg klasse" /></SelectTrigger>
                <SelectContent>
                  {configs.map((c, i) => (
                    <SelectItem key={i} value={String(i)}>{c.car_class} · {c.driver_category} (#{c.number_from}-{c.number_to})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Bilklasse</Label>
                <Select value={carClass} onValueChange={setCarClass}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CAR_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Kategori</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DRIVER_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
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
          <DialogFooter><Button type="submit" disabled={carNumber == null}>Gem</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
