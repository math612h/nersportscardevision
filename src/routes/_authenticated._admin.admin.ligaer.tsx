import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Settings } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer")({
  component: AdminLeagues,
});

function AdminLeagues() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

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
    const { error } = await supabase.from("leagues").insert({ name: name.trim(), description: desc.trim() || null, created_by: user?.id });
    if (error) return toast.error(error.message);
    toast.success("Liga oprettet"); setOpen(false); setName(""); setDesc(""); qc.invalidateQueries({ queryKey: ["leagues-admin"] }); qc.invalidateQueries({ queryKey: ["leagues"] });
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leagues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slettet"); qc.invalidateQueries({ queryKey: ["leagues-admin"] }); qc.invalidateQueries({ queryKey: ["leagues"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ligaer</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Ny liga</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Opret liga</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Beskrivelse</Label><Textarea maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <DialogFooter><Button type="submit">Opret</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {leagues?.length === 0 && <p className="text-muted-foreground">Ingen ligaer endnu.</p>}
        {leagues?.map((l) => (
          <Card key={l.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{l.name}</CardTitle>
                  {l.description && <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { if (confirm("Slet liga?")) del.mutate(l.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link to="/admin/ligaer/$leagueId/afdelinger" params={{ leagueId: l.id }}><Button variant="outline" size="sm" className="gap-1"><Settings className="h-4 w-4" /> Afdelinger</Button></Link>
              <Link to="/admin/ligaer/$leagueId/regler" params={{ leagueId: l.id }}><Button variant="outline" size="sm">Regler</Button></Link>
              <Link to="/admin/ligaer/$leagueId/entries" params={{ leagueId: l.id }}><Button variant="outline" size="sm">Entries</Button></Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
