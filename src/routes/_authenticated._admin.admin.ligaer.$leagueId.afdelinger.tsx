import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LMU_TRACKS, CAR_CLASSES, DRIVER_CATEGORIES } from "@/lib/tracks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer/$leagueId/afdelinger")({
  component: AdminDivisions,
});

function AdminDivisions() {
  const { leagueId } = useParams({ from: "/_authenticated/_admin/admin/ligaer/$leagueId/afdelinger" });
  const qc = useQueryClient();

  const { data: divisions } = useQuery({
    queryKey: ["divisions-admin", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("divisions").select("*").eq("league_id", leagueId).order("race_date");
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("divisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slettet"); qc.invalidateQueries({ queryKey: ["divisions-admin", leagueId] }); },
  });

  return (
    <div className="space-y-4">
      <Link to="/admin/ligaer" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-3 w-3" /> Ligaer</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Afdelinger</h1>
        <DivisionDialog leagueId={leagueId} onDone={() => qc.invalidateQueries({ queryKey: ["divisions-admin", leagueId] })} />
      </div>

      {divisions?.length === 0 && <p className="text-muted-foreground">Ingen afdelinger endnu.</p>}
      <div className="space-y-3">
        {divisions?.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{d.name}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { if (confirm("Slet afdeling?")) del.mutate(d.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-sm">
              {d.car_class && <Badge>{d.car_class}</Badge>}
              {d.driver_category && <Badge variant="secondary">{d.driver_category}</Badge>}
              {d.track && <Badge variant="outline">{d.track}{d.layout ? ` · ${d.layout}` : ""}</Badge>}
              {d.race_date && <Badge variant="outline">{format(new Date(d.race_date), "dd MMM yyyy HH:mm")}</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DivisionDialog({ leagueId, onDone }: { leagueId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [carClass, setCarClass] = useState<string>(CAR_CLASSES[0]);
  const [category, setCategory] = useState<string>(DRIVER_CATEGORIES[0]);
  const [trackIdx, setTrackIdx] = useState("0");
  const [layout, setLayout] = useState(LMU_TRACKS[0].layouts[0]);
  const [raceDate, setRaceDate] = useState("");
  const [settingsText, setSettingsText] = useState("");

  const track = LMU_TRACKS[Number(trackIdx)];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let settings = {};
    if (settingsText.trim()) {
      try { settings = JSON.parse(settingsText); } catch { return toast.error("Settings skal være gyldig JSON"); }
    }
    const { error } = await supabase.from("divisions").insert({
      league_id: leagueId, name: name.trim(),
      car_class: carClass, driver_category: category,
      track: track.name, layout,
      race_date: raceDate ? new Date(raceDate).toISOString() : null,
      settings,
    });
    if (error) return toast.error(error.message);
    toast.success("Afdeling oprettet"); setOpen(false); setName(""); setRaceDate(""); setSettingsText(""); onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Ny afdeling</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Opret afdeling</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="fx Round 1 – Spa" /></div>
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
          <div><Label>Bane</Label>
            <Select value={trackIdx} onValueChange={(v) => { setTrackIdx(v); setLayout(LMU_TRACKS[Number(v)].layouts[0]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LMU_TRACKS.map((t, i) => <SelectItem key={t.name} value={String(i)}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Layout</Label>
            <Select value={layout} onValueChange={setLayout}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{track.layouts.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Dato & tid</Label><Input type="datetime-local" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} /></div>
          <div><Label>Settings (JSON, valgfri)</Label>
            <Textarea rows={4} value={settingsText} onChange={(e) => setSettingsText(e.target.value)} placeholder='{"weather":"sunny","length":"60min","bop":"v2"}' />
          </div>
          <DialogFooter><Button type="submit">Opret</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
