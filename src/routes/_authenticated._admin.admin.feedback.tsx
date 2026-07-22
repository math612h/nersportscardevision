import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageSquare,
  ListChecks,
  Plus,
  Trash2,
  BarChart3,
  Power,
  PowerOff,
  ChevronDown,
  ChevronRight,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listAllFeedback,
  updateFeedback,
  deleteFeedback,
  listAllSurveys,
  createSurvey,
  updateSurveyActive,
  deleteSurvey,
  getSurveyResults,
  type SurveyQuestionType,
} from "@/lib/feedback.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/feedback")({
  component: AdminFeedbackPage,
});

function AdminFeedbackPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">Feedback & undersøgelser</h1>
      </div>

      <Tabs defaultValue="feedback">
        <TabsList>
          <TabsTrigger value="feedback" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="surveys" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Spørgeundersøgelser
          </TabsTrigger>
        </TabsList>
        <TabsContent value="feedback" className="pt-4">
          <FeedbackList />
        </TabsContent>
        <TabsContent value="surveys" className="pt-4">
          <SurveysAdmin />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ FEEDBACK LIST ============

const STATUS_OPTIONS = [
  { value: "new", label: "Ny" },
  { value: "read", label: "Læst" },
  { value: "planned", label: "Planlagt" },
  { value: "done", label: "Gennemført" },
  { value: "archived", label: "Arkiveret" },
];

function FeedbackList() {
  const listFn = useServerFn(listAllFeedback);
  const updateFn = useServerFn(updateFeedback);
  const deleteFn = useServerFn(deleteFeedback);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-all-feedback"],
    queryFn: () => listFn(),
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");

  const updateM = useMutation({
    mutationFn: async (input: { id: string; status?: string; admin_notes?: string }) =>
      updateFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-all-feedback"] }),
    onError: (e: any) => toast.error(e?.message ?? "Fejl"),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Slettet");
      qc.invalidateQueries({ queryKey: ["admin-all-feedback"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Fejl"),
  });

  const rows = (data ?? []).filter((f) => statusFilter === "all" || f.status === statusFilter);

  const counts = (data ?? []).reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">Filter:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle ({(data ?? []).length})</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label} ({counts[s.value] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Indlæser…</p>}
      {rows.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">Ingen feedback endnu.</p>
      )}

      <div className="space-y-3">
        {rows.map((f) => (
          <Card key={f.id}>
            <CardContent className="space-y-2 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {f.author?.display_name ?? "Ukendt bruger"} ·{" "}
                  {new Date(f.created_at).toLocaleString("da-DK")}
                </span>
                <div className="flex items-center gap-2">
                  <Select
                    value={f.status}
                    onValueChange={(v) => updateM.mutate({ id: f.id, status: v })}
                  >
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => {
                      if (confirm("Slet denne feedback?")) deleteM.mutate(f.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm">{f.message}</p>
              <Textarea
                defaultValue={f.admin_notes ?? ""}
                placeholder="Interne noter…"
                rows={2}
                className="text-xs"
                onBlur={(e) => {
                  const val = e.target.value;
                  if ((f.admin_notes ?? "") !== val)
                    updateM.mutate({ id: f.id, admin_notes: val });
                }}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============ SURVEYS ADMIN ============

function SurveysAdmin() {
  const listFn = useServerFn(listAllSurveys);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-all-surveys"],
    queryFn: () => listFn(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Opret undersøgelser med afkrydsning eller uddybende tekst. Sæt undersøgelsen som anonym
          hvis identiteten ikke skal registreres.
        </p>
        <CreateSurveyDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Indlæser…</p>}
      {(data ?? []).length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Ingen undersøgelser endnu.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(data ?? []).map((s) => (
          <SurveyRow key={s.id} survey={s} />
        ))}
      </div>
    </div>
  );
}

function SurveyRow({ survey }: { survey: any }) {
  const [expanded, setExpanded] = useState(false);
  const updateActiveFn = useServerFn(updateSurveyActive);
  const deleteFn = useServerFn(deleteSurvey);
  const qc = useQueryClient();

  const toggleActive = useMutation({
    mutationFn: async () =>
      updateActiveFn({ data: { id: survey.id, is_active: !survey.is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-all-surveys"] }),
  });
  const del = useMutation({
    mutationFn: async () => deleteFn({ data: { id: survey.id } }),
    onSuccess: () => {
      toast.success("Slettet");
      qc.invalidateQueries({ queryKey: ["admin-all-surveys"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {survey.title}
              {survey.is_anonymous && (
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" /> Anonym
                </Badge>
              )}
              {!survey.is_active && <Badge variant="secondary">Lukket</Badge>}
            </CardTitle>
            <CardDescription>
              {survey.response_count} besvarelser · {survey.questions.length} spørgsmål
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggleActive.mutate()}
              className="gap-1"
            >
              {survey.is_active ? (
                <>
                  <PowerOff className="h-3.5 w-3.5" /> Luk
                </>
              ) : (
                <>
                  <Power className="h-3.5 w-3.5" /> Åbn
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => setExpanded((v) => !v)}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Resultater
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (confirm("Slet undersøgelse og alle besvarelser?")) del.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <SurveyResults id={survey.id} />
        </CardContent>
      )}
    </Card>
  );
}

function SurveyResults({ id }: { id: string }) {
  const fn = useServerFn(getSurveyResults);
  const { data, isLoading } = useQuery({
    queryKey: ["survey-results", id],
    queryFn: () => fn({ data: { id } }),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Indlæser…</p>;
  if (!data) return null;
  if (data.response_count === 0)
    return <p className="text-sm text-muted-foreground">Ingen besvarelser endnu.</p>;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        {data.response_count} besvarelser i alt {data.is_anonymous && "· anonyme"}
      </p>
      {data.questions.map((q, idx) => (
        <div key={q.id} className="rounded border border-border/60 bg-muted/20 p-3">
          <h4 className="mb-2 text-sm font-semibold">
            {idx + 1}. {q.question_text}
          </h4>
          {q.question_type === "text" ? (
            <div className="space-y-2">
              {q.text_answers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ingen tekstsvar.</p>
              ) : (
                q.text_answers.map((a, i) => (
                  <div key={i} className="rounded bg-background p-2 text-sm">
                    <p className="whitespace-pre-wrap">{a.value}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {a.user?.display_name ?? (data.is_anonymous ? "Anonym" : "Ukendt")} ·{" "}
                      {a.created_at && new Date(a.created_at).toLocaleString("da-DK")}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {q.options.map((opt) => {
                const count = q.choice_counts[opt] ?? 0;
                const pct = data.response_count > 0 ? (count / data.response_count) * 100 : 0;
                return (
                  <div key={opt}>
                    <div className="flex justify-between text-xs">
                      <span>{opt}</span>
                      <span className="text-muted-foreground">
                        {count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-0.5 h-2 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ CREATE SURVEY ============

type DraftQuestion = {
  question_text: string;
  question_type: SurveyQuestionType;
  options: string[];
  required: boolean;
};

function CreateSurveyDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { question_text: "", question_type: "single_choice", options: ["", ""], required: true },
  ]);

  const createFn = useServerFn(createSurvey);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const cleaned = questions
        .map((q) => ({
          ...q,
          question_text: q.question_text.trim(),
          options: q.question_type === "text" ? [] : q.options.map((o) => o.trim()).filter(Boolean),
        }))
        .filter((q) => q.question_text.length > 0);
      if (cleaned.length === 0) throw new Error("Tilføj mindst ét spørgsmål");
      for (const q of cleaned) {
        if (q.question_type !== "text" && q.options.length < 2)
          throw new Error(`Spørgsmålet "${q.question_text}" skal have mindst to svarmuligheder`);
      }
      return createFn({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          is_anonymous: isAnonymous,
          is_active: true,
          questions: cleaned,
        },
      });
    },
    onSuccess: () => {
      toast.success("Undersøgelse oprettet");
      setOpen(false);
      setTitle("");
      setDescription("");
      setIsAnonymous(false);
      setQuestions([
        { question_text: "", question_type: "single_choice", options: ["", ""], required: true },
      ]);
      qc.invalidateQueries({ queryKey: ["admin-all-surveys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Fejl"),
  });

  const updateQ = (i: number, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };
  const addOption = (i: number) =>
    updateQ(i, { options: [...(questions[i].options ?? []), ""] });
  const setOption = (i: number, oi: number, v: string) => {
    const opts = [...questions[i].options];
    opts[oi] = v;
    updateQ(i, { options: opts });
  };
  const removeOption = (i: number, oi: number) => {
    updateQ(i, { options: questions[i].options.filter((_, k) => k !== oi) });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1">
          <Plus className="h-4 w-4" /> Ny undersøgelse
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opret spørgeundersøgelse</DialogTitle>
          <DialogDescription>
            Tilføj spørgsmål med afkrydsningsvar eller uddybende tekstsvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="s-title">Titel</Label>
            <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-desc">Beskrivelse (valgfri)</Label>
            <Textarea
              id="s-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded border border-border/60 bg-muted/30 p-3">
            <div>
              <Label className="text-sm">Anonym undersøgelse</Label>
              <p className="text-xs text-muted-foreground">
                Hvis slået til: admins kan ikke se hvem der har svaret hvad.
              </p>
            </div>
            <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Spørgsmål</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() =>
                  setQuestions((p) => [
                    ...p,
                    {
                      question_text: "",
                      question_type: "single_choice",
                      options: ["", ""],
                      required: true,
                    },
                  ])
                }
              >
                <Plus className="h-3 w-3" /> Tilføj spørgsmål
              </Button>
            </div>

            {questions.map((q, i) => (
              <div key={i} className="space-y-2 rounded border border-border/60 p-3">
                <div className="flex items-start gap-2">
                  <Input
                    placeholder={`Spørgsmål ${i + 1}`}
                    value={q.question_text}
                    onChange={(e) => updateQ(i, { question_text: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() =>
                      setQuestions((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : p))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    value={q.question_type}
                    onValueChange={(v: SurveyQuestionType) =>
                      updateQ(i, {
                        question_type: v,
                        options: v === "text" ? [] : q.options.length ? q.options : ["", ""],
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single_choice">Vælg ét (radio)</SelectItem>
                      <SelectItem value="multi_choice">Vælg flere (afkrydsning)</SelectItem>
                      <SelectItem value="text">Uddybende tekst</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={q.required}
                      onCheckedChange={(v) => updateQ(i, { required: v })}
                    />
                    Påkrævet
                  </label>
                </div>
                {q.question_type !== "text" && (
                  <div className="space-y-1.5 pl-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <Input
                          value={opt}
                          placeholder={`Svarmulighed ${oi + 1}`}
                          onChange={(e) => setOption(i, oi, e.target.value)}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => removeOption(i, oi)}
                          disabled={q.options.length <= 2}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      onClick={() => addOption(i)}
                    >
                      <Plus className="h-3 w-3" /> Tilføj svarmulighed
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annullér
          </Button>
          <Button onClick={() => m.mutate()} disabled={!title.trim() || m.isPending}>
            {m.isPending ? "Opretter…" : "Opret undersøgelse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
