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

function StreamPhotoSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const { data: photo } = useQuery({
    queryKey: ["stream-photo", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("stream_photo_path")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      const path = data?.stream_photo_path as string | null;
      if (!path) return null;
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24);
      return { path, url: signed?.signedUrl ?? null };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["stream-photo", userId] });

  const onFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Vælg venligst en billedfil");
    if (file.size > 10 * 1024 * 1024) return toast.error("Billedet må maks. fylde 10 MB");
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/stream-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ stream_photo_path: path })
        .eq("id", userId);
      if (error) throw error;
      if (photo?.path) await supabase.storage.from(BUCKET).remove([photo.path]);
      toast.success("Streambillede uploadet");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke uploade billedet");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    if (!photo?.path) return;
    setBusy(true);
    try {
      await supabase.storage.from(BUCKET).remove([photo.path]);
      await (supabase as any).from("profiles").update({ stream_photo_path: null }).eq("id", userId);
      toast.success("Streambillede fjernet");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <Label className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" /> Streambillede
        </Label>
        <p className="text-xs text-muted-foreground">
          Billedet bliver vist på streamen, når du bliver nævnt. Det skal være præsentabelt og
          velegnet: skarpt, i god belysning, med dig i midten og gerne fritlagt/neutral baggrund –
          brug eksemplet til højre som reference. Maks. 10 MB.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Dit billede</p>
          <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
            {photo?.url ? (
              <img src={photo.url} alt="Dit streambillede" className="h-full w-full object-cover" />
            ) : (
              <span className="p-4 text-center text-xs text-muted-foreground">Intet billede uploadet endnu</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {photo?.url ? "Skift billede" : "Upload billede"}
            </Button>
            {photo?.url && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={removePhoto}>
                <Trash2 className="mr-2 h-4 w-4 text-destructive" /> Fjern
              </Button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Eksempel</p>
          <div className="aspect-[3/4] overflow-hidden rounded-md border bg-muted/30">
            <img
              src={streamPhotoExample.url}
              alt="Eksempel på et godt streambillede: kører i racerdragt, fritlagt baggrund"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

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
