import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquarePlus, ListChecks, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  submitFeedback,
  listActiveSurveys,
  submitSurveyResponse,
  listMyFeedback,
  type Survey,
} from "@/lib/feedback.functions";

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback – LMU Danmark" },
      { name: "description", content: "Send feedback og deltag i spørgeundersøgelser hos LMU Danmark." },
      { property: "og:title", content: "Feedback – LMU Danmark" },
      { property: "og:description", content: "Din feedback hjælper os med at forbedre platformen." },
    ],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Din stemme</p>
        <h1 className="text-2xl font-bold tracking-tight">Feedback & undersøgelser</h1>
        <p className="text-sm text-muted-foreground">
          Feedback til hjemmesiden er nødvendigt for at vi kan gøre det endnu bedre. Det er ikke
          sikkert at forslag bliver vedtaget, men de bliver alle læst og vurderet.
        </p>
      </header>

      <FeedbackForm />
      <ActiveSurveys />
      <MyFeedback />
    </div>
  );
}

function FeedbackForm() {
  const [message, setMessage] = useState("");
  const submit = useServerFn(submitFeedback);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (msg: string) => submit({ data: { message: msg } }),
    onSuccess: () => {
      toast.success("Tak! Din feedback er sendt.");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["my-feedback"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunne ikke sende feedback"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquarePlus className="h-4 w-4 text-primary" />
          Send feedback
        </CardTitle>
        <CardDescription>
          Del ris, ros, fejlrapporter eller forslag til nye funktioner.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Skriv din feedback her…"
          rows={6}
          maxLength={5000}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{message.length} / 5000</span>
          <Button
            onClick={() => m.mutate(message)}
            disabled={!message.trim() || m.isPending}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {m.isPending ? "Sender…" : "Send feedback"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveSurveys() {
  const list = useServerFn(listActiveSurveys);
  const { data } = useQuery({
    queryKey: ["active-surveys"],
    queryFn: () => list(),
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Aktive spørgeundersøgelser</h2>
      </div>
      {data.map((row) => (
        <SurveyCard key={row.survey.id} survey={row.survey} alreadyAnswered={row.answered} />
      ))}
    </div>
  );
}

function SurveyCard({ survey, alreadyAnswered }: { survey: Survey; alreadyAnswered: boolean }) {
  const [answers, setAnswers] = useState<
    Record<string, { choice_values?: string[]; text_value?: string }>
  >({});
  const [done, setDone] = useState(alreadyAnswered);
  const submit = useServerFn(submitSurveyResponse);
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: async () => {
      const payload = survey.questions.map((q) => ({
        question_id: q.id,
        choice_values: answers[q.id]?.choice_values ?? [],
        text_value: answers[q.id]?.text_value ?? null,
      }));
      // Validate required
      for (const q of survey.questions) {
        if (!q.required) continue;
        const a = answers[q.id];
        if (q.question_type === "text") {
          if (!a?.text_value?.trim()) throw new Error(`Svar påkrævet: ${q.question_text}`);
        } else {
          if (!a?.choice_values?.length) throw new Error(`Vælg mindst ét svar: ${q.question_text}`);
        }
      }
      return submit({ data: { survey_id: survey.id, answers: payload } });
    },
    onSuccess: () => {
      toast.success("Tak for din besvarelse!");
      setDone(true);
      qc.invalidateQueries({ queryKey: ["active-surveys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunne ikke gemme besvarelse"),
  });

  if (done) {
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {survey.title}
          </CardTitle>
          <CardDescription>Tak — du har allerede svaret på denne undersøgelse.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const setChoice = (qid: string, value: string, multi: boolean) => {
    setAnswers((prev) => {
      const cur = prev[qid]?.choice_values ?? [];
      if (multi) {
        const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
        return { ...prev, [qid]: { ...prev[qid], choice_values: next } };
      }
      return { ...prev, [qid]: { ...prev[qid], choice_values: [value] } };
    });
  };
  const setText = (qid: string, v: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], text_value: v } }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>{survey.title}</span>
          {survey.is_anonymous && <Badge variant="outline">Anonym</Badge>}
        </CardTitle>
        {survey.description && <CardDescription>{survey.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        {survey.questions.map((q, idx) => (
          <div key={q.id} className="space-y-2">
            <Label className="text-sm font-medium">
              {idx + 1}. {q.question_text}
              {q.required && <span className="ml-1 text-destructive">*</span>}
            </Label>
            {q.question_type === "text" && (
              <Textarea
                rows={3}
                value={answers[q.id]?.text_value ?? ""}
                onChange={(e) => setText(q.id, e.target.value)}
                placeholder="Skriv dit svar…"
              />
            )}
            {q.question_type === "single_choice" && (
              <RadioGroup
                value={answers[q.id]?.choice_values?.[0] ?? ""}
                onValueChange={(v) => setChoice(q.id, v, false)}
              >
                {q.options.map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`${q.id}-${opt}`} />
                    <Label htmlFor={`${q.id}-${opt}`} className="text-sm font-normal">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
            {q.question_type === "multi_choice" && (
              <div className="space-y-2">
                {q.options.map((opt) => {
                  const checked = answers[q.id]?.choice_values?.includes(opt) ?? false;
                  return (
                    <div key={opt} className="flex items-center gap-2">
                      <Checkbox
                        id={`${q.id}-${opt}`}
                        checked={checked}
                        onCheckedChange={() => setChoice(q.id, opt, true)}
                      />
                      <Label htmlFor={`${q.id}-${opt}`} className="text-sm font-normal">
                        {opt}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <Button onClick={() => m.mutate()} disabled={m.isPending} className="gap-2">
          <Send className="h-4 w-4" />
          {m.isPending ? "Sender…" : "Indsend besvarelse"}
        </Button>
      </CardContent>
    </Card>
  );
}

function MyFeedback() {
  const list = useServerFn(listMyFeedback);
  const { data } = useQuery({
    queryKey: ["my-feedback"],
    queryFn: () => list(),
  });
  if (!data || data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Din tidligere feedback</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((f: any) => (
          <div key={f.id} className="rounded border border-border/60 bg-muted/30 p-3">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{new Date(f.created_at).toLocaleString("da-DK")}</span>
              <Badge variant="outline" className="text-[10px]">
                {f.status === "new"
                  ? "Ny"
                  : f.status === "read"
                    ? "Læst"
                    : f.status === "planned"
                      ? "Planlagt"
                      : f.status === "done"
                        ? "Gennemført"
                        : f.status === "archived"
                          ? "Arkiveret"
                          : f.status}
              </Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm">{f.message}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
