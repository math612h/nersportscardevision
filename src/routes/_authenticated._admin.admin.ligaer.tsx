import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Settings } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CAR_CLASSES, DRIVER_CATEGORIES, type ClassConfig } from "@/lib/tracks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer")({
  component: AdminLeagues,
});

function emptyConfig(): ClassConfig {
  return { car_class: CAR_CLASSES[0], driver_category: DRIVER_CATEGORIES[0], number_from: 1, number_to: 50 };
}

function AdminLeagues() {
  const { user } = useAuth();
  const location = useLocation();
  const isLeagueList = location.pathname === "/admin/ligaer";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [configs, setConfigs] = useState<ClassConfig[]>([emptyConfig()]);
  const [createdLeague, setCreatedLeague] = useState(false);

  const { data: leagues } = useQuery({
    queryKey: ["leagues-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateConfig = (i: number, patch: Partial<ClassConfig>) =>
    setConfigs((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeConfig = (i: number) => setConfigs((prev) => prev.filter((_, idx) => idx !== i));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (configs.length === 0) return toast.error("Tilføj mindst én bilklasse.");
    for (const c of configs) {
      if (!c.car_class || !c.driver_category) return toast.error("Udfyld klasse og kategori.");
      if (!Number.isInteger(c.number_from) || !Number.isInteger(c.number_to) || c.number_from < 1 || c.number_to < c.number_from)
        return toast.error("Ugyldigt nummerinterval.");
    }
    const first = configs[0];
    const { error } = await supabase.from("leagues").insert({
      name: name.trim(),
      description: desc.trim() || null,
      car_class: first.car_class,
      driver_category: first.driver_category,
      class_configs: configs as any,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Liga oprettet");
    setCreatedLeague(true);
    setOpen(false);
    setName("");
    setDesc("");
    setConfigs([emptyConfig()]);
    qc.invalidateQueries({ queryKey: ["leagues-admin"] });
    qc.invalidateQueries({ queryKey: ["leagues"] });
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leagues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slettet"); qc.invalidateQueries({ queryKey: ["leagues-admin"] }); qc.invalidateQueries({ queryKey: ["leagues"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isLeagueList) return <Outlet />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Ligaer</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-1"><Link to="/admin"><ArrowLeft className="h-4 w-4" /> Kontrolpanel</Link></Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Ny liga</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Opret liga</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label>Beskrivelse</Label><Textarea maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Bilklasser og kørenumre</Label>
                  {configs.map((c, i) => (
                    <div key={i} className="space-y-2 rounded-md border border-border p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Klasse {i + 1}</span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeConfig(i)} disabled={configs.length === 1}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Klasse</Label>
                          <Select value={c.car_class} onValueChange={(v) => updateConfig(i, { car_class: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{CAR_CLASSES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Kategori</Label>
                          <Select value={c.driver_category} onValueChange={(v) => updateConfig(i, { driver_category: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{DRIVER_CATEGORIES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Fra nr.</Label>
                          <Input type="number" min={1} value={c.number_from} onChange={(e) => updateConfig(i, { number_from: Number(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-xs">Til nr.</Label>
                          <Input type="number" min={1} value={c.number_to} onChange={(e) => updateConfig(i, { number_to: Number(e.target.value) })} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="w-full gap-1" onClick={() => setConfigs((p) => [...p, emptyConfig()])}>
                    <Plus className="h-3 w-3" /> Tilføj klasse
                  </Button>
                </div>
                <DialogFooter><Button type="submit">Opret</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {createdLeague && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-sm">
          <span>Ligaen er oprettet.</span>
          <Button asChild size="sm" variant="outline"><Link to="/admin">Returner til Kontrolpanel</Link></Button>
        </div>
      )}

      <div className="space-y-3">
        {leagues?.length === 0 && <p className="text-muted-foreground">Ingen ligaer endnu.</p>}
        {leagues?.map((l: any) => {
          const cfgs: ClassConfig[] = Array.isArray(l.class_configs) ? l.class_configs : [];
          return (
            <Card key={l.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{l.name}</CardTitle>
                    {l.description && <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {cfgs.length > 0
                        ? cfgs.map((c, i) => (
                            <Badge key={i} variant="outline">{c.car_class} {c.driver_category} · #{c.number_from}-{c.number_to}</Badge>
                          ))
                        : (<>
                            {l.car_class && <Badge>{l.car_class}</Badge>}
                            {l.driver_category && <Badge variant="secondary">{l.driver_category}</Badge>}
                          </>)}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm("Slet liga?")) del.mutate(l.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1"><Link to="/admin/ligaer/$leagueId/afdelinger" params={{ leagueId: l.id }}><Settings className="h-4 w-4" /> Afdelinger</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/admin/ligaer/$leagueId/regler" params={{ leagueId: l.id }}>Regler</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/admin/ligaer/$leagueId/entries" params={{ leagueId: l.id }}>Entries</Link></Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
