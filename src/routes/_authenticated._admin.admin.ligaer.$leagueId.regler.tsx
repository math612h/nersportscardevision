import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer/$leagueId/regler")({
  component: AdminRules,
});

function AdminRules() {
  const { leagueId } = useParams({ from: "/_authenticated/_admin/admin/ligaer/$leagueId/regler" });
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: rules } = useQuery({
    queryKey: ["rules-admin", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rulesets")
        .select("*")
        .eq("league_id", leagueId)
        .order("section_number", { ascending: true, nullsFirst: false })
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("rulesets").insert({
      league_id: leagueId,
      section_number: section.trim() || null,
      title: title.trim(),
      content: content.trim(),
      sort_order: (rules?.length ?? 0),
    });
    if (error) return toast.error(error.message);
    toast.success("Regel oprettet"); setOpen(false); setSection(""); setTitle(""); setContent("");
    qc.invalidateQueries({ queryKey: ["rules-admin", leagueId] });
    qc.invalidateQueries({ queryKey: ["rules", leagueId] });
  };

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("rulesets").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rules-admin", leagueId] }); qc.invalidateQueries({ queryKey: ["rules", leagueId] }); },
  });

  const grouped = (rules ?? []).reduce<Record<string, any[]>>((acc, r: any) => {
    const main = r.section_number ? String(r.section_number).split(".")[0] : "—";
    (acc[main] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Link to="/admin/ligaer" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-3 w-3" /> Ligaer</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Regelsæt</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Ny regel</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Opret regel</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div><Label>Sektionsnummer</Label><Input maxLength={20} value={section} onChange={(e) => setSection(e.target.value)} placeholder="fx 1.0, 1.1, 2.0" /></div>
              <div><Label>Overskrift</Label><Input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="fx Startprocedure" /></div>
              <div><Label>Indhold</Label><Textarea required maxLength={5000} rows={8} value={content} onChange={(e) => setContent(e.target.value)} /></div>
              <DialogFooter><Button type="submit">Opret</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {rules?.length === 0 && <p className="text-muted-foreground">Ingen regler endnu.</p>}
      <div className="space-y-6">
        {Object.entries(grouped).map(([main, list]) => (
          <div key={main} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sektion {main}</h2>
            <Accordion type="multiple" className="w-full">
              {list.map((r) => (
                <AccordionItem key={r.id} value={r.id}>
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2">
                      {r.section_number && <span className="text-muted-foreground">{r.section_number}</span>}
                      {r.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto shrink-0"
                      onClick={(e) => { e.stopPropagation(); if (confirm("Slet regel?")) del.mutate(r.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AccordionTrigger>
                  <AccordionContent className="whitespace-pre-wrap text-sm">{r.content}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>
    </div>
  );
}
