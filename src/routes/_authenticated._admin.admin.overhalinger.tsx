import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Video, Trash2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DriverLink } from "@/components/DriverLink";
import { weekLabel, youtubeEmbedUrl } from "@/lib/overtaking-utils";

export const Route = createFileRoute("/_authenticated/_admin/admin/overhalinger")({
  component: OverhalingerAdmin,
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

type Vote = { clip_id: string };

type Profile = { id: string; display_name: string | null; lmu_name: string | null };

function OverhalingerAdmin() {
  const qc = useQueryClient();

  const { data: clips = [], isLoading } = useQuery({
    queryKey: ["admin-overtaking-clips"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("overtaking_clips")
        .select("id,user_id,youtube_id,youtube_url,title,week_start,created_at")
        .order("week_start", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Clip[];
    },
  });

  const clipIds = clips.map((c) => c.id);
  const userIds = Array.from(new Set(clips.map((c) => c.user_id)));

  const { data: votes = [] } = useQuery({
    queryKey: ["admin-overtaking-votes", clipIds.join(",")],
    enabled: clipIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("overtaking_votes")
        .select("clip_id")
        .in("clip_id", clipIds);
      if (error) throw error;
      return (data ?? []) as Vote[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-overtaking-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("id,display_name,lmu_name").in("id", userIds);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const voteCount = useMemo(() => {
    const m = new Map<string, number>();
    votes.forEach((v) => m.set(v.clip_id, (m.get(v.clip_id) ?? 0) + 1));
    return m;
  }, [votes]);

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Clip[]>();
    for (const c of clips) {
      const arr = groups.get(c.week_start) ?? [];
      arr.push(c);
      groups.set(c.week_start, arr);
    }
    return Array.from(groups.entries());
  }, [clips]);

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("overtaking_clips").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Klip slettet");
    qc.invalidateQueries({ queryKey: ["admin-overtaking-clips"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Video className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold tracking-tight">Ugens Overhaling</h1>
      </div>

      {isLoading && <div className="h-64 animate-pulse rounded-xl border border-border bg-card/50" />}

      {!isLoading && grouped.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ingen klip indsendt endnu.
        </p>
      )}

      <div className="space-y-6">
        {grouped.map(([week, list]) => (
          <section key={week} className="space-y-3">
            <h2 className="text-sm font-semibold text-primary">{weekLabel(week)}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((clip) => {
                const profile = profileMap.get(clip.user_id);
                const count = voteCount.get(clip.id) ?? 0;
                return (
                  <div key={clip.id} className="overflow-hidden rounded-xl border border-border bg-card">
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
                    <div className="space-y-2 p-3">
                      {clip.title && <p className="text-sm font-semibold">{clip.title}</p>}
                      <div className="flex items-center justify-between gap-2">
                        <DriverLink
                          userId={clip.user_id}
                          name={profile?.display_name ?? profile?.lmu_name ?? "Kører"}
                          size="sm"
                        />
                        <Badge variant="secondary" className="tabular-nums">{count} stemmer</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(clip.created_at), "dd MMM HH:mm")}</span>
                        <a
                          href={clip.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" /> Åbn
                        </a>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" className="w-full gap-1">
                            <Trash2 className="h-3.5 w-3.5" /> Fjern klip
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Fjern klip?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Klippet og alle dets stemmer fjernes permanent.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuller</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(clip.id)}>Fjern</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
