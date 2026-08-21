import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Radio, Plus, Trash2, Search, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/_admin/admin/streaming-profil")({
  head: () => ({ meta: [{ title: "Streaming profil – Kontrolpanel" }] }),
  component: AdminStreamingProfile,
});

type Question = {
  id: string;
  question_text: string;
  help_text: string | null;
  position: number;
  active: boolean;
};

function QuestionsPanel() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [help, setHelp] = useState("");

  const { data: questions, isLoading } = useQuery({
    queryKey: ["admin-streaming-questions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("streaming_profile_questions")
        .select("id, question_text, help_text, position, active")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-streaming-questions"] });

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    const pos = (questions?.at(-1)?.position ?? 0) + 1;
    const { error } = await (supabase as any)
      .from("streaming_profile_questions")
      .insert({ question_text: t, help_text: help.trim() || null, position: pos });
    if (error) return toast.error(error.message);
    setText("");
    setHelp("");
    toast.success("Spørgsmål tilføjet");
    refresh();
  };

  const toggle = async (q: Question) => {
    const { error } = await (supabase as any)
      .from("streaming_profile_questions")
      .update({ active: !q.active })
      .eq("id", q.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const remove = async (q: Question) => {
    if (!confirm("Slet spørgsmålet og alle besvarelser?")) return;
    const { error } = await (supabase as any)
      .from("streaming_profile_questions")
      .delete()
      .eq("id", q.id);
    if (error) return toast.error(error.message);
    toast.success("Spørgsmål slettet");
    refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Spørgsmål</CardTitle>
        <CardDescription>Spørgsmålene vises på brugernes profil under "Streaming profil".</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="q-text">Spørgsmål</Label>
            <Input id="q-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="F.eks. Hvor kommer du fra?" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="q-help">Hjælpetekst (valgfri)</Label>
            <Input id="q-help" value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Vises under spørgsmålet" />
          </div>
          <Button onClick={add} disabled={!text.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Tilføj
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Indlæser…</p>
        ) : (
          <div className="divide-y rounded-md border">
            {(questions ?? []).map((q) => (
              <div key={q.id} className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{q.question_text}</p>
                  {q.help_text && <p className="truncate text-xs text-muted-foreground">{q.help_text}</p>}
                </div>
                {!q.active && <Badge variant="outline">Skjult</Badge>}
                <Button variant="ghost" size="icon" onClick={() => toggle(q)} title={q.active ? "Skjul" : "Vis"}>
                  {q.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(q)} title="Slet">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {!questions?.length && <p className="p-3 text-sm text-muted-foreground">Ingen spørgsmål endnu.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ProfileRow = { id: string; display_name: string | null; lmu_name: string | null };

function AnswersPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ProfileRow | null>(null);

  const { data: profiles } = useQuery({
    queryKey: ["admin-streaming-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, display_name, lmu_name")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const { data: answered } = useQuery({
    queryKey: ["admin-streaming-answered"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("streaming_profile_answers")
        .select("user_id, answer");
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => { if ((r.answer ?? "").trim()) set.add(r.user_id); });
      return set;
    },
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["admin-streaming-answers", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const [{ data: qs }, { data: as }] = await Promise.all([
        (supabase as any)
          .from("streaming_profile_questions")
          .select("id, question_text, position")
          .order("position", { ascending: true }),
        (supabase as any)
          .from("streaming_profile_answers")
          .select("id, question_id, answer, updated_at")
          .eq("user_id", selected!.id),
      ]);
      const byQ: Record<string, any> = {};
      (as ?? []).forEach((a: any) => { byQ[a.question_id] = a; });
      return (qs ?? []).map((question: any) => ({
        question_id: question.id,
        question_text: question.question_text,
        answer: byQ[question.id]?.answer ?? "",
        answer_id: byQ[question.id]?.id ?? null,
      }));
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (profiles ?? []).filter((p) =>
      !needle ||
      (p.display_name ?? "").toLowerCase().includes(needle) ||
      (p.lmu_name ?? "").toLowerCase().includes(needle),
    );
  }, [profiles, q]);

  const deleteAnswer = async (answerId: string) => {
    const { error } = await (supabase as any).from("streaming_profile_answers").delete().eq("id", answerId);
    if (error) return toast.error(error.message);
    toast.success("Besvarelse fjernet");
    qc.invalidateQueries({ queryKey: ["admin-streaming-answers", selected?.id] });
    qc.invalidateQueries({ queryKey: ["admin-streaming-answered"] });
  };

  if (selected) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => setSelected(null)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Alle profiler
          </Button>
          <CardTitle className="text-base">{selected.display_name ?? "Uden navn"}</CardTitle>
          {selected.lmu_name && <CardDescription>LMU: {selected.lmu_name}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3">
          {detailLoading ? (
            <p className="text-sm text-muted-foreground">Indlæser…</p>
          ) : (
            (detail ?? []).map((row: any) => (
              <div key={row.question_id} className="rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">{row.question_text}</p>
                    <p className="whitespace-pre-wrap text-sm">
                      {row.answer || <span className="text-muted-foreground">Ikke besvaret</span>}
                    </p>
                  </div>
                  {row.answer_id && (
                    <Button variant="ghost" size="icon" onClick={() => deleteAnswer(row.answer_id)} title="Fjern besvarelse">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Besvarelser pr. profil</CardTitle>
        <CardDescription>Vælg en profil for at se og fjerne besvarelser.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative sm:max-w-sm">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg navn…" className="pl-8" />
        </div>
        <div className="divide-y rounded-md border">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-muted/50"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{(p.display_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.display_name ?? "Uden navn"}</p>
                {p.lmu_name && <p className="truncate text-xs text-muted-foreground">{p.lmu_name}</p>}
              </div>
              {answered?.has(p.id) ? (
                <Badge variant="secondary">Besvaret</Badge>
              ) : (
                <Badge variant="outline">Tom</Badge>
              )}
            </button>
          ))}
          {!filtered.length && <p className="p-3 text-sm text-muted-foreground">Ingen profiler matcher.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminStreamingProfile() {
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 text-primary">
        <Radio className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">Streaming profil</h1>
      </header>
      <p className="text-sm text-muted-foreground">
        Spørgsmål og besvarelser deles med streamere via broadcast-API'et
        (<code className="text-xs">/api/public/broadcast/streaming-profiles</code>).
      </p>
      <Tabs defaultValue="besvarelser">
        <TabsList>
          <TabsTrigger value="besvarelser">Besvarelser</TabsTrigger>
          <TabsTrigger value="spoergsmaal">Spørgsmål</TabsTrigger>
        </TabsList>
        <TabsContent value="besvarelser" className="mt-4">
          <AnswersPanel />
        </TabsContent>
        <TabsContent value="spoergsmaal" className="mt-4">
          <QuestionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
