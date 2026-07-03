import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/_admin/admin/regelsaet/")({
  component: RulesetArchive,
});

function RulesetArchive() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const { data: templates } = useQuery({
    queryKey: ["ruleset-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ruleset_templates")
        .select("id, name, description, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabase
      .from("ruleset_templates")
      .insert({ name: name.trim(), description: desc.trim() || null, created_by: user?.id ?? null });
    if (error) return toast.error(error.message);
    toast.success("Regelsæt oprettet");
    setOpen(false); setName(""); setDesc("");
    qc.invalidateQueries({ queryKey: ["ruleset-templates"] });
  };

  const del = async (id: string) => {
    if (!confirm("Slet regelsæt? Alle regler i det slettes også.")) return;
    const { error } = await supabase.from("ruleset_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Slettet");
    qc.invalidateQueries({ queryKey: ["ruleset-templates"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Regelsæt-arkiv</h1>
          <p className="text-sm text-muted-foreground">Opret og administrer regelsæt uafhængigt af ligaer. Kan indlæses ind i en liga fra ligaens regelside.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Nyt regelsæt</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Opret regelsæt</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="fx GT3 Sprint 2026" /></div>
              <div><Label>Beskrivelse</Label><Textarea maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <DialogFooter><Button type="submit">Opret</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {templates?.length === 0 && <p className="text-muted-foreground">Ingen regelsæt endnu.</p>}

      <div className="grid gap-2">
        {(templates ?? []).map((t: any) => (
          <Card key={t.id}>
            <CardContent className="flex items-center justify-between gap-2 py-3">
              <Link
                to="/admin/regelsaet/$templateId"
                params={{ templateId: t.id }}
                className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  {t.description && <p className="truncate text-xs text-muted-foreground">{t.description}</p>}
                </div>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => del(t.id)}><Trash2 className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
