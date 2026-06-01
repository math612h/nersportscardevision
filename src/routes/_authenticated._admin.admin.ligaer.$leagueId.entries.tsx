import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CAR_CLASSES, DRIVER_CATEGORIES } from "@/lib/tracks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      if (divisionIds.length === 0) return [];
      const { data: entries, error: entriesError } = await supabase.from("entries").select("*").in("division_id", divisionIds).order("created_at");
      if (entriesError) throw entriesError;
      const divisionNames = new Map((divisions ?? []).map((d) => [d.id, d.name]));
      return (entries ?? []).map((entry) => ({ ...entry, divisionName: divisionNames.get(entry.division_id) ?? "Ukendt" }));
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("entries").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Fjernet"); qc.invalidateQueries({ queryKey: ["entries-admin", leagueId] }); },
    onError: (e: any) => toast.error(e.message),
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
                          <span>{e.driver_name}</span>
                          <Button variant="ghost" size="sm" onClick={() => del.mutate(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
