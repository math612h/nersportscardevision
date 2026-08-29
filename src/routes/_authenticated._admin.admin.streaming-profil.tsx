import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Radio, Plus, Trash2, Search, ArrowLeft, Eye, EyeOff, Download, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { signStreamPhotoUrl } from "@/lib/stream-photo";

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

type ProfileRow = {
  id: string;
  display_name: string | null;
  lmu_name: string | null;
  stream_photo_path: string | null;
};

function StreamPhotoPanel({ profile }: { profile: ProfileRow }) {
  const { data: url } = useQuery({
    queryKey: ["admin-stream-photo", profile.stream_photo_path],
    enabled: !!profile.stream_photo_path,
    queryFn: () => signStreamPhotoUrl(profile.stream_photo_path),
  });

  const download = async () => {
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = (profile.stream_photo_path ?? "").split(".").pop() || "jpg";
      const name = (profile.display_name || profile.lmu_name || "streambillede")
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name || "streambillede"}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke hente billedet");
    }
  };

  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <ImageIcon className="h-4 w-4" /> Streambillede
      </p>
      {profile.stream_photo_path ? (
        <div className="flex items-end gap-3">
          <div className="h-40 w-30 overflow-hidden rounded-md border bg-muted/30">
            {url ? <img src={url} alt="Streambillede" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!url} onClick={download}>
              <Download className="mr-1 h-4 w-4" /> Hent billede
            </Button>
            {url && (
              <Button size="sm" variant="ghost" asChild>
                <a href={url} target="_blank" rel="noreferrer">Åbn</a>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Intet streambillede uploadet.</p>
      )}
    </div>
  );
}

type LeagueOption = { id: string; name: string };

function useStreamingProfilesFilter() {
  const [q, setQ] = useState("");
  const [leagueId, setLeagueId] = useState<string>("");

  const { data: leagues } = useQuery({
    queryKey: ["admin-streaming-leagues"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("leagues")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeagueOption[];
    },
  });

  const { data: leagueUserIds } = useQuery({
    queryKey: ["admin-streaming-league-users", leagueId],
    queryFn: async () => {
      if (!leagueId) return null;
      const { data, error } = await (supabase as any)
        .from("entries")
        .select("user_id")
        .eq("league_id", leagueId);
      if (error) throw error;
      return new Set<string>((data ?? []).map((e: any) => e.user_id as string));
    },
    enabled: !!leagueId,
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin-streaming-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, display_name, lmu_name, stream_photo_path")
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (profiles ?? []).filter((p) => {
      if (leagueId && leagueUserIds && !leagueUserIds.has(p.id)) return false;
      if (!needle) return true;
      return (
        (p.display_name ?? "").toLowerCase().includes(needle) ||
        (p.lmu_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [profiles, q, leagueId, leagueUserIds]);

  const answeredProfiles = useMemo(
    () => filtered.filter((p) => answered?.has(p.id)),
    [filtered, answered],
  );

  const missingProfiles = useMemo(
    () => filtered.filter((p) => !answered?.has(p.id)),
    [filtered, answered],
  );

  return {
    q,
    setQ,
    leagueId,
    setLeagueId,
    leagues: leagues ?? [],
    answered,
    answeredProfiles,
    missingProfiles,
  };
}

function ProfileRowButton({
  p,
  answered,
  onSelect,
}: {
  p: ProfileRow;
  answered: Set<string> | undefined;
  onSelect: (p: ProfileRow) => void;
}) {
  return (
    <button
      key={p.id}
      onClick={() => onSelect(p)}
      className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-muted/50"
    >
      <Avatar className="h-8 w-8">
        <AvatarFallback>{(p.display_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.display_name ?? "Uden navn"}</p>
        {p.lmu_name && <p className="truncate text-xs text-muted-foreground">{p.lmu_name}</p>}
      </div>
      {p.stream_photo_path && (
        <Badge variant="outline" className="gap-1">
          <ImageIcon className="h-3 w-3" /> Billede
        </Badge>
      )}
      {answered?.has(p.id) ? (
        <Badge variant="secondary">Besvaret</Badge>
      ) : (
        <Badge variant="outline">Tom</Badge>
      )}
    </button>
  );
}

function AnswersPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const {
    q,
    setQ,
    leagueId,
    setLeagueId,
    leagues,
    answered,
    answeredProfiles,
    missingProfiles,
  } = useStreamingProfilesFilter();

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
          <StreamPhotoPanel profile={selected} />
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
        <CardDescription>
          Filtrér efter liga, og se hvem der har besvaret streaming-profilen, og hvem der mangler.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg navn…" className="pl-8" />
          </div>
          <Select value={leagueId} onValueChange={setLeagueId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Alle ligaer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Alle ligaer</SelectItem>
              {leagues.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Besvaret</h3>
            <Badge variant="secondary">{answeredProfiles.length}</Badge>
          </div>
          <div className="divide-y rounded-md border">
            {answeredProfiles.map((p) => (
              <ProfileRowButton key={p.id} p={p} answered={answered} onSelect={setSelected} />
            ))}
            {!answeredProfiles.length && (
              <p className="p-3 text-sm text-muted-foreground">Ingen profiler matcher.</p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Mangler besvarelse</h3>
            <Badge variant="outline">{missingProfiles.length}</Badge>
          </div>
          <div className="divide-y rounded-md border">
            {missingProfiles.map((p) => (
              <ProfileRowButton key={p.id} p={p} answered={answered} onSelect={setSelected} />
            ))}
            {!missingProfiles.length && (
              <p className="p-3 text-sm text-muted-foreground">Ingen profiler matcher.</p>
            )}
          </div>
        </section>
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
