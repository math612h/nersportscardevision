import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Settings } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CAR_CLASSES, DRIVER_CATEGORIES } from "@/lib/tracks";
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

function AdminLeagues() {
  const { user } = useAuth();
  const location = useLocation();
  const isLeagueList = location.pathname === "/admin/ligaer";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [carClass, setCarClass] = useState<string>(CAR_CLASSES[0]);
  const [category, setCategory] = useState<string>(DRIVER_CATEGORIES[0]);
  const [createdLeague, setCreatedLeague] = useState(false);

  const { data: leagues } = useQuery({
    queryKey: ["leagues-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("leagues").insert({
      name: name.trim(),
      description: desc.trim() || null,
      car_class: carClass,
      driver_category: category,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Liga oprettet"); setCreatedLeague(true); setOpen(false); setName(""); setDesc(""); qc.invalidateQueries({ queryKey: ["leagues-admin"] }); qc.invalidateQueries({ queryKey: ["leagues"] });
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
            <DialogContent>
              <DialogHeader><DialogTitle>Opret liga</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label>Beskrivelse</Label><Textarea maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
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
        {leagues?.map((l: any) => (
          <Card key={l.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{l.name}</CardTitle>
                  {l.description && <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {l.car_class && <Badge>{l.car_class}</Badge>}
                    {l.driver_category && <Badge variant="secondary">{l.driver_category}</Badge>}
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
        ))}
      </div>
    </div>
  );
}
