import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Radio, Loader2, Upload, Trash2, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import streamPhotoExample from "@/assets/stream-photo-example.png.asset.json";

const BUCKET = "stream-photos";

export type StreamingQuestion = {
  id: string;
  question_text: string;
  help_text: string | null;
  position: number;
};

export function StreamingProfileCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: questions, isLoading } = useQuery({
    queryKey: ["streaming-questions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("streaming_profile_questions")
        .select("id, question_text, help_text, position")
        .eq("active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StreamingQuestion[];
    },
  });

  const { data: answers } = useQuery({
    queryKey: ["streaming-answers", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("streaming_profile_answers")
        .select("question_id, answer")
        .eq("user_id", userId);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.question_id] = r.answer ?? ""; });
      return map;
    },
  });

  useEffect(() => {
    if (answers) setValues(answers);
  }, [answers]);

  const save = async () => {
    if (!questions) return;
    setSaving(true);
    try {
      const rows = questions.map((q) => ({
        user_id: userId,
        question_id: q.id,
        answer: (values[q.id] ?? "").trim(),
      }));
      const { error } = await (supabase as any)
        .from("streaming_profile_answers")
        .upsert(rows, { onConflict: "user_id,question_id" });
      if (error) throw error;
      toast.success("Streaming profil gemt");
      qc.invalidateQueries({ queryKey: ["streaming-answers", userId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke gemme");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" /> Streaming profil
        </CardTitle>
        <CardDescription>
          Disse informationer kan blive nævnt på live streamen LMU Danmark på YouTube og Twitch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <StreamPhotoSection userId={userId} />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Indlæser…</p>
        ) : !questions?.length ? (
          <p className="text-sm text-muted-foreground">Der er endnu ingen spørgsmål.</p>
        ) : (
          <>
            {questions.map((q) => (
              <div key={q.id} className="space-y-1.5">
                <Label htmlFor={`sq-${q.id}`}>{q.question_text}</Label>
                {q.help_text && <p className="text-xs text-muted-foreground">{q.help_text}</p>}
                <Textarea
                  id={`sq-${q.id}`}
                  rows={2}
                  value={values[q.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))}
                  placeholder="Dit svar…"
                />
              </div>
            ))}
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gem streaming profil
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
