import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trophy, Video, Plus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DriverLink } from "@/components/DriverLink";
import {
  getCurrentWeekStartISO, weekLabel, shiftWeek,
  parseYouTubeId, youtubeEmbedUrl,
} from "@/lib/overtaking-utils";

const PAGE_TITLE = "Ugens Overhaling — LMU Danmark";
const PAGE_DESC = "Se ugens bedste overhalinger og stem på din favorit.";

export const Route = createFileRoute("/ugens-overhaling")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UgensOverhalingPage,
});

type Clip = {
  id: string;
  user_id: string;
  youtube_id: string;
  youtube_url: string;
  title: string | null;
  week_start: string;
  created_at: string;
};

type Vote = { id: string; clip_id: string; user_id: string; week_start: string };

type Profile = { id: string; display_name: string | null; lmu_name: string | null };

function UgensOverhalingPage() {
  const { user, isGuest } = useAuth();
  const qc = useQueryClient();
  const currentWeek = getCurrentWeekStartISO();
  const [week, setWeek] = useState<string>(currentWeek);
  const isCurrent = week === currentWeek;
  const isPast = week < currentWeek;
  const canInteract = !!user && !isGuest;

  const { data: clips = [], isLoading } = useQuery({
    queryKey: ["overtaking-clips", week],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("overtaking_clips")
        .select("id,user_id,youtube_id,youtube_url,title,week_start,created_at")
        .eq("week_start", week)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Clip[];
    },
  });

  const clipIds = clips.map((c) => c.id);
  const userIds = Array.from(new Set(clips.map((c) => c.user_id)));

  const { data: votes = [] } = useQuery({
    queryKey: ["overtaking-votes", week, clipIds.join(",")],
    enabled: clipIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("overtaking_votes")
        .select("id,clip_id,user_id,week_start")
        .in("clip_id", clipIds);
      if (error) throw error;
      return (data ?? []) as Vote[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["overtaking-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,lmu_name")
        .in("id", userIds);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const voteCount = useMemo(() => {
    const m = new Map<string, number>();
    votes.forEach((v) => m.set(v.clip_id, (m.get(v.clip_id) ?? 0) + 1));
    return m;
  }, [votes]);

  const myVote = useMemo(
    () => (user ? votes.find((v) => v.user_id === user.id) ?? null : null),
    [votes, user],
  );

  // Vinder for afsluttede uger (klip med flest stemmer, mindst 1)
  const winner = useMemo(() => {
    if (!isPast || clips.length === 0) return null;
    let best: Clip | null = null;
    let bestCount = 0;
    for (const c of clips) {
      const n = voteCount.get(c.id) ?? 0;
      if (n > bestCount) { best = c; bestCount = n; }
    }
    return best && bestCount > 0 ? { clip: best, votes: bestCount } : null;
  }, [isPast, clips, voteCount]);

  const voteMutation = useMutation({
    mutationFn: async (clipId: string) => {
      if (!user) throw new Error("Log ind for at stemme");
      if (!isCurrent) throw new Error("Du kan kun stemme i indeværende uge");
      // Hvis samme klip: fjern
      if (myVote?.clip_id === clipId) {
        const { error } = await (supabase as any)
          .from("overtaking_votes").delete().eq("id", myVote.id);
        if (error) throw error;
        return;
      }
      // Ellers fjern eksisterende og indsæt
      if (myVote) {
        const { error: delErr } = await (supabase as any)
          .from("overtaking_votes").delete().eq("id", myVote.id);
        if (delErr) throw delErr;
      }
      const { error } = await (supabase as any)
        .from("overtaking_votes")
        .insert({ clip_id: clipId, user_id: user.id, week_start: currentWeek });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtaking-votes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunne ikke registrere stemme"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("overtaking_clips").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Klip slettet");
      qc.invalidateQueries({ queryKey: ["overtaking-clips"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunne ikke slette"),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ugens Overhaling</h1>
        </div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Forsiden
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeek((w) => shiftWeek(w, -1))} aria-label="Forrige uge">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[220px] text-center text-sm font-medium">
            {weekLabel(week)}
            {isCurrent && <span className="ml-2 text-xs text-primary">(indeværende)</span>}
          </div>
          <Button
            variant="outline" size="icon"
            onClick={() => setWeek((w) => shiftWeek(w, 1))}
            disabled={week >= currentWeek}
            aria-label="Næste uge"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrent && (
            <Button variant="ghost" size="sm" onClick={() => setWeek(currentWeek)}>Til nu</Button>
          )}
        </div>

        {canInteract && isCurrent && <SubmitClipDialog weekStart={currentWeek} userId={user!.id} />}
      </div>

      {winner && (
        <section className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-amber-600 dark:text-amber-300">
            <Trophy className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">Ugens Overhaling</span>
            <span className="text-xs text-muted-foreground">· {winner.votes} stemmer</span>
          </div>
          <div className="flex items-center gap-3">
            <DriverLink
              userId={winner.clip.user_id}
              name={profileMap.get(winner.clip.user_id)?.display_name ?? "Kører"}
              size="md"
            />
          </div>
        </section>
      )}

      {isLoading && <div className="h-64 animate-pulse rounded-xl border border-border bg-card/50" />}

      {!isLoading && clips.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ingen klip for denne uge{isCurrent ? " endnu — vær den første til at dele en overhaling." : "."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clips.map((clip) => {
          const count = voteCount.get(clip.id) ?? 0;
          const mine = myVote?.clip_id === clip.id;
          const profile = profileMap.get(clip.user_id);
          const isWinner = winner?.clip.id === clip.id;
          const isMyClip = user?.id === clip.user_id;
          return (
            <article
              key={clip.id}
              className={`overflow-hidden rounded-xl border bg-card ${
                isWinner ? "border-amber-400/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]" : "border-border"
              }`}
            >
              <div className="aspect-video w-full bg-muted">
                <iframe
                  src={youtubeEmbedUrl(clip.youtube_id)}
                  title={clip.title ?? "Overhaling"}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
              <div className="space-y-3 p-3">
                {clip.title && <h2 className="text-sm font-semibold">{clip.title}</h2>}
                <div className="flex items-center justify-between gap-2">
                  <DriverLink
                    userId={clip.user_id}
                    name={profile?.display_name ?? profile?.lmu_name ?? "Kører"}
                    size="sm"
                  />
                  <div className="flex items-center gap-1.5">
                    {isWinner && <Badge className="gap-1"><Trophy className="h-3 w-3" /> Vinder</Badge>}
                    <Badge variant="secondary" className="tabular-nums">{count} stemmer</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCurrent && canInteract && (
                    <Button
                      size="sm"
                      variant={mine ? "default" : "outline"}
                      onClick={() => voteMutation.mutate(clip.id)}
                      disabled={voteMutation.isPending}
                      className="flex-1"
                    >
                      {mine ? "Din stemme (klik for at fjerne)" : "Stem"}
                    </Button>
                  )}
                  {isCurrent && !canInteract && (
                    <p className="flex-1 text-xs text-muted-foreground">Log ind som kører for at stemme.</p>
                  )}
                  {isMyClip && isCurrent && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Slet klip">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Slet dit klip?</AlertDialogTitle>
                          <AlertDialogDescription>Handlingen kan ikke fortrydes.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuller</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(clip.id)}>Slet</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SubmitClipDialog({ weekStart, userId }: { weekStart: string; userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const id = parseYouTubeId(url);
    if (!id) {
      toast.error("Indsæt et gyldigt YouTube-link");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("overtaking_clips").insert({
      user_id: userId,
      youtube_url: url.trim(),
      youtube_id: id,
      title: title.trim() ? title.trim().slice(0, 120) : null,
      week_start: weekStart,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Klip indsendt");
    setUrl(""); setTitle(""); setOpen(false);
    qc.invalidateQueries({ queryKey: ["overtaking-clips"] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Indsend klip</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Indsend Ugens Overhaling</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="yt-url">YouTube-link</Label>
            <Input
              id="yt-url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="yt-title">Titel (valgfri)</Label>
            <Input
              id="yt-title"
              placeholder="Kort beskrivelse"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuller</Button>
          <Button onClick={submit} disabled={saving || !url.trim()}>Indsend</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
