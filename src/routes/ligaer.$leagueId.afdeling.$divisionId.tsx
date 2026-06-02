import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Calendar, MapPin, MessageSquareWarning, UserX, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WEATHER_BY_KEY, type WeatherKey, type ClassConfig } from "@/lib/tracks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/ligaer/$leagueId/afdeling/$divisionId")({
  component: DivisionDetail,
});

function DivisionDetail() {
  const { leagueId, divisionId } = useParams({ from: "/ligaer/$leagueId/afdeling/$divisionId" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: div } = useQuery({
    queryKey: ["division", divisionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("divisions").select("*").eq("id", divisionId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: league } = useQuery({
    queryKey: ["league", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: signups } = useQuery({
    queryKey: ["league-signups", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id,user_id,driver_name,car_class,driver_category,car_number,waitlist,created_at")
        .eq("league_id", leagueId)
        .is("division_id", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Public list (no reason) — visible to everyone
  const { data: absences } = useQuery({
    queryKey: ["division-absences", divisionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("division_absences_public")
        .select("id,user_id,created_at")
        .eq("division_id", divisionId);
      if (error) throw error;
      return (data ?? []) as { id: string; user_id: string; created_at: string }[];
    },
  });

  // Reasons — only owner/admin rows are returned by RLS
  const { data: absenceReasons } = useQuery({
    queryKey: ["division-absence-reasons", divisionId, user?.id ?? "anon"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("division_absences")
        .select("id,user_id,reason")
        .eq("division_id", divisionId)
        .not("reason", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const absenceByUser = new Map((absences ?? []).map((a) => [a.user_id, a]));
  const reasonByUser = new Map((absenceReasons ?? []).map((a) => [a.user_id, a.reason]));
  const myAbsence = user ? absenceByUser.get(user.id) : undefined;
  const mySignup = (signups ?? []).find((e) => e.user_id === user?.id);

  const configs: ClassConfig[] = Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];
  const keys = configs.length
    ? configs.map((c) => `${c.car_class} · ${c.driver_category}`)
    : Array.from(new Set((signups ?? []).map((e) => `${e.car_class} · ${e.driver_category}`)));

  const grouped: Record<string, typeof signups> = {};
  for (const k of keys) grouped[k] = [];
  for (const e of signups ?? []) {
    const k = `${e.car_class} · ${e.driver_category}`;
    (grouped[k] ??= [] as any).push(e);
  }

  const removeAbsence = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("division_absences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["division-absences", divisionId] });
      toast.success("Markeret som deltager igen");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalSignups = signups?.length ?? 0;
  const absentCount = absences?.length ?? 0;
  const participantCount = totalSignups - absentCount;

  return (
    <div className="space-y-6">
      <Link to="/ligaer/$leagueId" params={{ leagueId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tilbage
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{div?.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {div?.track && <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" />{div.track}{div.layout ? ` · ${div.layout}` : ""}</Badge>}
          {div?.race_date && <Badge variant="outline" className="gap-1"><Calendar className="h-3 w-3" />{format(new Date(div.race_date), "dd MMM yyyy HH:mm")}</Badge>}
        </div>
      </div>

      {Array.isArray((div?.settings as any)?.weather) && (div!.settings as any).weather.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Vejr</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {((div!.settings as any).weather as WeatherKey[]).map((key, i) => {
                const w = WEATHER_BY_KEY[key];
                if (!w) return null;
                const Icon = w.icon;
                return (
                  <span key={i} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs">
                    <span className="text-muted-foreground">Slot {i + 1}</span>
                    <Icon className="h-4 w-4" /> {w.label}
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {!user && (
          <Button onClick={() => navigate({ to: "/login" })}>Log ind</Button>
        )}
        {user && !mySignup && (
          <p className="text-sm text-muted-foreground">Du er ikke tilmeldt ligaen. Tilmeld dig på ligasiden for at deltage.</p>
        )}
        {user && mySignup && !myAbsence && (
          <AbsenceDialog divisionId={divisionId} userId={user.id} />
        )}
        {user && myAbsence && (
          <Button variant="outline" className="gap-1" onClick={() => removeAbsence.mutate(myAbsence.id)}>
            <UserCheck className="h-4 w-4" /> Jeg deltager alligevel
          </Button>
        )}
        {user && <ProtestDialog divisionId={divisionId} />}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">
          Deltagere ({participantCount}/{totalSignups})
          {absentCount > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">· {absentCount} deltager ikke</span>}
        </h2>
        {totalSignups === 0 && <p className="text-sm text-muted-foreground">Ingen tilmeldte til ligaen endnu.</p>}
        <div className="space-y-3">
          {Object.entries(grouped).map(([k, list]) => {
            if (!list || list.length === 0) return null;
            const [cls, cat] = k.split(" · ");
            const sorted = [...list].sort((a, b) => (a.car_number ?? 0) - (b.car_number ?? 0));
            return (
              <Card key={k}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span>{cls}</span>
                    <Badge variant="outline" className="text-[10px]">{cat}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="divide-y divide-border">
                    {sorted.map((e) => {
                      const ab = absenceByUser.get(e.user_id);
                      return (
                        <li key={e.id} className={`flex items-center gap-3 py-2 text-sm ${ab ? "opacity-60" : ""}`}>
                          <span className="inline-flex h-7 min-w-9 items-center justify-center rounded bg-muted px-2 font-mono text-xs font-semibold tabular-nums">
                            #{e.car_number}
                          </span>
                          <span className={`flex-1 truncate ${ab ? "line-through" : ""}`}>{e.driver_name}</span>
                          {e.waitlist && <Badge variant="outline" className="text-[10px]">Venteliste</Badge>}
                          {ab && (
                            <Badge variant="secondary" className="gap-1 text-[10px]" title={reasonByUser.get(e.user_id) ?? undefined}>
                              <UserX className="h-3 w-3" /> Deltager ikke
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {(absenceReasons?.length ?? 0) > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Begrundelser</h3>
            <ul className="space-y-1.5">
              {(absenceReasons ?? []).map((a) => {
                const e = (signups ?? []).find((s) => s.user_id === a.user_id);
                return (
                  <li key={a.id} className="rounded border border-border px-3 py-2 text-sm">
                    <span className="font-medium">{e?.driver_name ?? "Ukendt kører"}:</span>{" "}
                    <span className="text-muted-foreground">{a.reason}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function AbsenceDialog({ divisionId, userId }: { divisionId: string; userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("division_absences").insert({
      division_id: divisionId,
      user_id: userId,
      reason: reason.trim() || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Markeret som ikke-deltagende");
      setOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["division-absences", divisionId] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1"><UserX className="h-4 w-4" /> Deltager ikke</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Marker som ikke-deltagende</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Begrundelse (valgfri)</Label>
            <Textarea
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Fx ferie, sygdom, andet løb…"
            />
          </div>
          <DialogFooter>
            <Button type="submit">Bekræft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProtestDialog({ divisionId }: { divisionId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [lap, setLap] = useState("");
  const [corner, setCorner] = useState("");
  const [involved, setInvolved] = useState<string[]>([""]);
  const [desc, setDesc] = useState("");
  const [video, setVideo] = useState("");

  const updateDriver = (idx: number, val: string) => {
    setInvolved((arr) => arr.map((v, i) => (i === idx ? val : v)));
  };
  const addDriver = () => setInvolved((arr) => [...arr, ""]);
  const removeDriver = (idx: number) => setInvolved((arr) => (arr.length === 1 ? [""] : arr.filter((_, i) => i !== idx)));

  const reset = () => {
    setLap(""); setCorner(""); setInvolved([""]); setDesc(""); setVideo("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (video && !/^https?:\/\//i.test(video)) { toast.error("Video link skal være en gyldig URL"); return; }
    const cleaned = involved.map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("protests").insert({
      division_id: divisionId, submitted_by: user.id,
      lap_number: lap ? Number(lap) : null,
      corner: corner.trim() || null,
      involved_drivers: cleaned.length ? cleaned.join(", ") : null,
      description: desc.trim(), video_url: video.trim() || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Protest indsendt"); setOpen(false); reset(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="gap-1"><MessageSquareWarning className="h-4 w-4" /> Indsend protest</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Indsend protest</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Omgang</Label><Input type="number" min={1} value={lap} onChange={(e) => setLap(e.target.value)} /></div>
            <div><Label>Sving</Label><Input maxLength={50} value={corner} onChange={(e) => setCorner(e.target.value)} placeholder="fx T7" /></div>
          </div>
          <div className="space-y-2">
            <Label>Involverede kørere</Label>
            {involved.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  maxLength={80}
                  value={v}
                  onChange={(e) => updateDriver(i, e.target.value)}
                  placeholder={`Kører ${i + 1}`}
                />
                {(involved.length > 1 || v) && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeDriver(i)} className="shrink-0">
                    Fjern
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addDriver}>+ Tilføj kører</Button>
          </div>
          <div><Label>Beskrivelse</Label><Textarea required maxLength={2000} value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} /></div>
          <div><Label>Video-link (valgfri)</Label><Input type="url" maxLength={500} value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://…" /></div>
          <DialogFooter><Button type="submit">Send</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
