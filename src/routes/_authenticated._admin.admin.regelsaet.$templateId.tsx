import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { compareSectionNumbers, shiftRuleNumbersForInsert } from "@/lib/rules-renumber";

export const Route = createFileRoute("/_authenticated/_admin/admin/regelsaet/$templateId")({
  component: TemplateEditor,
});

function TemplateEditor() {
  const { templateId } = useParams({ from: "/_authenticated/_admin/admin/regelsaet/$templateId" });
  const qc = useQueryClient();
  const [ruleOpen, setRuleOpen] = useState(false);
  const [defaultSection, setDefaultSection] = useState("");

  const { data: template } = useQuery({
    queryKey: ["ruleset-template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ruleset_templates")
        .select("*")
        .eq("id", templateId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rules } = useQuery({
    queryKey: ["ruleset-template-rules", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ruleset_template_rules")
        .select("*")
        .eq("template_id", templateId)
        .order("section_number", { ascending: true, nullsFirst: false })
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: sections } = useQuery({
    queryKey: ["ruleset-template-sections", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ruleset_template_sections" as any)
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order")
        .order("section_number");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ruleset-template-rules", templateId] });
    qc.invalidateQueries({ queryKey: ["ruleset-template-sections", templateId] });
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ruleset_template_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const delSection = async (id: string, main: string) => {
    const count = (rules ?? []).filter((r: any) => (r.section_number ?? "").split(".")[0] === main).length;
    if (!confirm(count > 0 ? `Sektionen har ${count} regler. Slet kun sektionens navn?` : "Slet sektion?")) return;
    const { error } = await supabase.from("ruleset_template_sections" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Sektion slettet");
    invalidate();
  };

  const grouped = (rules ?? []).reduce<Record<string, any[]>>((acc, r: any) => {
    const main = r.section_number ? String(r.section_number).split(".")[0] : "—";
    (acc[main] ??= []).push(r);
    return acc;
  }, {});
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a: any, b: any) => compareSectionNumbers(a.section_number, b.section_number));
  }

  const sectionMap = new Map<string, any>((sections ?? []).map((s) => [String(s.section_number), s]));

  const orderedKeys = Array.from(
    new Set<string>([...(sections ?? []).map((s) => String(s.section_number)), ...Object.keys(grouped)]),
  ).sort((a, b) => {
    const na = parseFloat(a); const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const openNewRule = (section?: string) => {
    setDefaultSection(section ? `${section}.` : "");
    setRuleOpen(true);
  };

  return (
    <div className="space-y-4">
      <Link to="/admin/regelsaet" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-3 w-3" /> Regelsæt-arkiv
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{template?.name ?? "Regelsæt"}</h1>
          {template?.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <NewSectionDialog templateId={templateId} sectionCount={sections?.length ?? 0} onCreated={invalidate} />
          <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1"><Plus className="h-4 w-4" /> Ny regel</Button>
            </DialogTrigger>
            <NewRuleDialogContent
              templateId={templateId}
              defaultSection={defaultSection}
              sections={sections ?? []}
              existingCount={rules?.length ?? 0}
              onDone={() => { setRuleOpen(false); invalidate(); }}
            />
          </Dialog>
        </div>
      </div>

      {orderedKeys.length === 0 && <p className="text-muted-foreground">Ingen sektioner endnu. Opret en sektion for at komme i gang.</p>}

      <Accordion type="multiple" className="space-y-2">
        {orderedKeys.map((main) => {
          const list = grouped[main] ?? [];
          const section = sectionMap.get(main);
          return (
            <AccordionItem key={main} value={`sec-${main}`} className="overflow-hidden rounded-xl border bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex flex-1 items-center gap-3 text-left">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                    {main}
                  </span>
                  <span className="font-semibold">{section?.title ?? `Sektion ${main} (unavngivet)`}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <span className="mr-2 text-xs text-muted-foreground">{list.length}</span>
                    {section ? (
                      <EditSectionDialog section={section} onSaved={invalidate} />
                    ) : (
                      <CreateNamedSectionButton templateId={templateId} sectionNumber={main} onCreated={invalidate} />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); openNewRule(main); }}
                      title="Ny regel i denne sektion"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    {section && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); delSection(section.id, main); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="border-t bg-muted/20 px-2 pb-2 pt-2">
                {list.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Ingen regler i denne sektion endnu.</p>
                ) : (
                  <Accordion type="multiple" className="space-y-1">
                    {list.map((r) => (
                      <AccordionItem key={r.id} value={r.id} className="overflow-hidden rounded-lg border bg-background">
                        <AccordionTrigger className="px-3 py-2 text-left text-sm hover:no-underline">
                          <span className="flex flex-1 items-center gap-2">
                            {r.section_number && <span className="text-xs text-muted-foreground">{r.section_number}</span>}
                            <span className="font-medium">{r.title}</span>
                            <span className="ml-auto flex shrink-0 items-center gap-1">
                              <EditRuleDialog rule={r} templateId={templateId} />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); if (confirm("Slet regel?")) del.mutate(r.id); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="whitespace-pre-wrap px-3 pb-3 text-sm leading-relaxed text-muted-foreground">
                          {r.content}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function NewRuleDialogContent({
  templateId,
  defaultSection,
  sections,
  existingCount,
  onDone,
}: {
  templateId: string;
  defaultSection: string;
  sections: any[];
  existingCount: number;
  onDone: () => void;
}) {
  const [section, setSection] = useState(defaultSection);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const sec = section.trim();
    if (sec) {
      await shiftRuleNumbersForInsert({
        table: "ruleset_template_rules",
        scopeColumn: "template_id",
        scopeValue: templateId,
        newSectionNumber: sec,
      });
    }
    const { error } = await supabase.from("ruleset_template_rules").insert({
      template_id: templateId,
      section_number: sec || null,
      title: title.trim(),
      content: content.trim(),
      sort_order: existingCount,
    });
    if (error) return toast.error(error.message);
    toast.success("Regel oprettet");
    setSection(""); setTitle(""); setContent("");
    onDone();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Opret regel</DialogTitle></DialogHeader>
      <form onSubmit={create} className="space-y-3">
        <div>
          <Label>Sektionsnummer</Label>
          <div className="flex gap-2">
            {sections.length > 0 && (
              <Select value={section.split(".")[0] || ""} onValueChange={(v) => setSection(v + ".")}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Vælg sektion" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={String(s.section_number)}>
                      {s.section_number}. {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input maxLength={20} value={section} onChange={(e) => setSection(e.target.value)} placeholder="fx 1.0, 1.1, 2.0" />
          </div>
        </div>
        <div><Label>Overskrift</Label><Input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="fx Startprocedure" /></div>
        <div><Label>Indhold</Label><Textarea required maxLength={5000} rows={8} value={content} onChange={(e) => setContent(e.target.value)} /></div>
        <DialogFooter><Button type="submit">Opret</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function NewSectionDialog({ templateId, sectionCount, onCreated }: { templateId: string; sectionCount: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("ruleset_template_sections" as any).insert({
      template_id: templateId,
      section_number: number.trim(),
      title: title.trim(),
      sort_order: sectionCount,
    });
    if (error) return toast.error(error.message);
    toast.success("Sektion oprettet");
    setOpen(false); setNumber(""); setTitle("");
    onCreated();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1"><FolderPlus className="h-4 w-4" /> Ny sektion</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Opret sektion</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Sektionsnummer</Label><Input required maxLength={10} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="fx 1" /></div>
          <div><Label>Navn</Label><Input required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="fx Sportslige regler" /></div>
          <DialogFooter><Button type="submit">Opret</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSectionDialog({ section, onSaved }: { section: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(String(section.section_number));
  const [title, setTitle] = useState(String(section.title));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase
      .from("ruleset_template_sections" as any)
      .update({ section_number: number.trim(), title: title.trim() })
      .eq("id", section.id);
    if (error) return toast.error(error.message);
    toast.success("Sektion opdateret");
    setOpen(false);
    onSaved();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} title="Omdøb sektion">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Omdøb sektion</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Sektionsnummer</Label><Input required maxLength={10} value={number} onChange={(e) => setNumber(e.target.value)} /></div>
          <div><Label>Navn</Label><Input required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <DialogFooter><Button type="submit">Gem</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateNamedSectionButton({ templateId, sectionNumber, onCreated }: { templateId: string; sectionNumber: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("ruleset_template_sections" as any).insert({
      template_id: templateId,
      section_number: sectionNumber,
      title: title.trim(),
      sort_order: parseInt(sectionNumber) || 0,
    });
    if (error) return toast.error(error.message);
    toast.success("Sektion navngivet");
    setOpen(false); setTitle("");
    onCreated();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} title="Navngiv sektion">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Navngiv sektion {sectionNumber}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Navn</Label><Input required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="fx Sportslige regler" /></div>
          <DialogFooter><Button type="submit">Gem</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditRuleDialog({ rule, templateId }: { rule: any; templateId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(rule.section_number ?? "");
  const [title, setTitle] = useState(rule.title ?? "");
  const [content, setContent] = useState(rule.content ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sec = section.trim();
    if (sec && sec !== (rule.section_number ?? "")) {
      await shiftRuleNumbersForInsert({
        table: "ruleset_template_rules",
        scopeColumn: "template_id",
        scopeValue: templateId,
        newSectionNumber: sec,
        excludeRuleId: rule.id,
      });
    }
    const { error } = await supabase
      .from("ruleset_template_rules")
      .update({
        section_number: sec || null,
        title: title.trim(),
        content: content.trim(),
      })
      .eq("id", rule.id);
    if (error) return toast.error(error.message);
    toast.success("Regel opdateret");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["ruleset-template-rules", templateId] });
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
