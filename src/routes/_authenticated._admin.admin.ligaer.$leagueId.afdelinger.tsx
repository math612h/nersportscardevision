import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LMU_TRACKS, WEATHER_OPTIONS, WEATHER_BY_KEY, WEATHER_SLOT_COUNT, type WeatherKey } from "@/lib/tracks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer/$leagueId/afdelinger")({
  component: AdminDivisions,
});

function AdminDivisions() {
  const { leagueId } = useParams({ from: "/_authenticated/_admin/admin/ligaer/$leagueId/afdelinger" });
  const qc = useQueryClient();

  const { data: league } = useQuery({
    queryKey: ["league-admin", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Afdelinger</h1>
          {league && (
            <div className="mt-1 flex gap-2 text-sm text-muted-foreground">
              <span>{league.name}</span>
              {league.car_class && <Badge variant="outline">{league.car_class}</Badge>}
              {league.driver_category && <Badge variant="outline">{league.driver_category}</Badge>}
            </div>
          )}
        </div>
        {league && <DivisionDialog leagueId={leagueId} carClass={league.car_class} category={league.driver_category} onDone={() => qc.invalidateQueries({ queryKey: ["divisions-admin", leagueId] })} />}
      </div>

      {divisions?.length === 0 && <p className="text-muted-foreground">Ingen afdelinger endnu.</p>}
      <div className="space-y-3">
        {divisions?.map((d: any) => {
          const slots: WeatherKey[] = Array.isArray(d.settings?.weather) ? d.settings.weather : [];
          return (
            <Card key={d.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{d.name}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm("Slet afdeling?")) del.mutate(d.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  {d.track && <Badge variant="outline">{d.track}{d.layout ? ` · ${d.layout}` : ""}</Badge>}
                  {d.race_date && <Badge variant="outline">{format(new Date(d.race_date), "dd MMM yyyy HH:mm")}</Badge>}
                </div>
                {slots.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {slots.map((key, i) => {
                      const w = WEATHER_BY_KEY[key];
                      if (!w) return null;
                      const Icon = w.icon;
                      return (
                        <span key={i} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs">
                          <Icon className="h-3 w-3" /> {w.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DivisionDialog({ leagueId, carClass, category, onDone }: { leagueId: string; carClass: string | null; category: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trackIdx, setTrackIdx] = useState("0");
  const [layout, setLayout] = useState(LMU_TRACKS[0].layouts[0]);
  const [raceDate, setRaceDate] = useState("");
  const [weather, setWeather] = useState<WeatherKey[]>(Array(WEATHER_SLOT_COUNT).fill("sunny"));

  const track = LMU_TRACKS[Number(trackIdx)];

  const setSlot = (i: number, v: WeatherKey) => setWeather((prev) => prev.map((w, idx) => (idx === i ? v : w)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("divisions").insert({
      league_id: leagueId, name: name.trim(),
      car_class: carClass, driver_category: category,
      track: track.name, layout,
      race_date: raceDate ? new Date(raceDate).toISOString() : null,
      settings: { weather },
    });
    if (error) return toast.error(error.message);
    toast.success("Afdeling oprettet"); setOpen(false); setName(""); setRaceDate(""); setWeather(Array(WEATHER_SLOT_COUNT).fill("sunny")); onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Ny afdeling</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Opret afdeling</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="fx Round 1 – Spa" /></div>
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
          <div className="space-y-2">
            <Label>Vejr (5 slots)</Label>
            <div className="space-y-2">
              {weather.map((val, i) => {
                const current = WEATHER_BY_KEY[val];
                const CurrentIcon = current?.icon;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-14 text-xs text-muted-foreground">Slot {i + 1}</span>
                    {CurrentIcon && <CurrentIcon className="h-4 w-4 text-muted-foreground" />}
                    <Select value={val} onValueChange={(v) => setSlot(i, v as WeatherKey)}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEATHER_OPTIONS.map((w) => {
                          const Icon = w.icon;
                          return (
                            <SelectItem key={w.key} value={w.key}>
                              <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" /> {w.label}</span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter><Button type="submit">Opret</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
