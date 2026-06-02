import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Save, FolderOpen, Archive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Regelsæt</h1>
        <div className="flex flex-wrap gap-2">
          <SaveTemplateDialog rules={rules ?? []} />
          <LoadTemplateDialog leagueId={leagueId} existingCount={rules?.length ?? 0} />
          <ManageTemplatesDialog />
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
      </div>
      {rules?.length === 0 && <p className="text-muted-foreground">Ingen regler endnu. Du kan indlæse et arkiveret regelsæt eller oprette en ny regel.</p>}
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
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      <EditRuleDialog rule={r} leagueId={leagueId} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); if (confirm("Slet regel?")) del.mutate(r.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
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

function EditRuleDialog({ rule, leagueId }: { rule: any; leagueId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(rule.section_number ?? "");
  const [title, setTitle] = useState(rule.title ?? "");
  const [content, setContent] = useState(rule.content ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase
      .from("rulesets")
      .update({
        section_number: section.trim() || null,
        title: title.trim(),
        content: content.trim(),
      })
      .eq("id", rule.id);
    if (error) return toast.error(error.message);
    toast.success("Regel opdateret");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["rules-admin", leagueId] });
    qc.invalidateQueries({ queryKey: ["rules", leagueId] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Rediger regel</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Sektionsnummer</Label><Input maxLength={20} value={section} onChange={(e) => setSection(e.target.value)} /></div>
          <div><Label>Overskrift</Label><Input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Indhold</Label><Textarea required maxLength={5000} rows={8} value={content} onChange={(e) => setContent(e.target.value)} /></div>
          <DialogFooter><Button type="submit">Gem</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveTemplateDialog({ rules }: { rules: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rules.length === 0) return toast.error("Der er ingen regler at gemme.");
    const { data: tpl, error } = await supabase
      .from("ruleset_templates")
      .insert({ name: name.trim(), description: desc.trim() || null })
      .select()
      .single();
    if (error || !tpl) return toast.error(error?.message ?? "Kunne ikke gemme");
    const rows = rules.map((r, i) => ({
      template_id: tpl.id,
      section_number: r.section_number,
      title: r.title,
      content: r.content,
      sort_order: r.sort_order ?? i,
    }));
    const { error: rErr } = await supabase.from("ruleset_template_rules").insert(rows);
    if (rErr) return toast.error(rErr.message);
    toast.success("Regelsæt arkiveret");
    setOpen(false); setName(""); setDesc("");
    qc.invalidateQueries({ queryKey: ["ruleset-templates"] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1"><Save className="h-4 w-4" /> Gem som skabelon</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Arkiver regelsæt</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="fx GT3 Sprint 2026" /></div>
          <div><Label>Beskrivelse</Label><Textarea maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">{rules.length} regler bliver gemt.</p>
          <DialogFooter><Button type="submit">Gem</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoadTemplateDialog({ leagueId, existingCount }: { leagueId: string; existingCount: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");

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
    enabled: open,
  });

  const load = async () => {
    if (!templateId) return toast.error("Vælg et regelsæt");
    const { data: tplRules, error } = await supabase
      .from("ruleset_template_rules")
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order");
    if (error) return toast.error(error.message);
    if (!tplRules || tplRules.length === 0) return toast.error("Skabelonen er tom");
    const rows = tplRules.map((r, i) => ({
      league_id: leagueId,
      section_number: r.section_number,
      title: r.title,
      content: r.content,
      sort_order: existingCount + i,
    }));
    const { error: iErr } = await supabase.from("rulesets").insert(rows);
    if (iErr) return toast.error(iErr.message);
    toast.success(`${rows.length} regler indlæst`);
    setOpen(false); setTemplateId("");
    qc.invalidateQueries({ queryKey: ["rules-admin", leagueId] });
    qc.invalidateQueries({ queryKey: ["rules", leagueId] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1"><FolderOpen className="h-4 w-4" /> Indlæs skabelon</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Indlæs arkiveret regelsæt</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Vælg regelsæt…" /></SelectTrigger>
            <SelectContent>
              {(templates ?? []).map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {templates?.length === 0 && <p className="text-sm text-muted-foreground">Ingen arkiverede regelsæt endnu.</p>}
          <p className="text-xs text-muted-foreground">Reglerne tilføjes til ligaens nuværende regelsæt.</p>
        </div>
        <DialogFooter><Button onClick={load} disabled={!templateId}>Indlæs</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageTemplatesDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

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
    enabled: open,
  });

  const del = async (id: string) => {
    if (!confirm("Slet arkiveret regelsæt?")) return;
    const { error } = await supabase.from("ruleset_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Slettet");
    qc.invalidateQueries({ queryKey: ["ruleset-templates"] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Administrer skabeloner"><Archive className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Arkiverede regelsæt</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {(templates ?? []).map((t: any) => (
            <Card key={t.id}>
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{t.name}</p>
                  {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => del(t.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
          {templates?.length === 0 && <p className="text-sm text-muted-foreground">Ingen arkiverede regelsæt.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
