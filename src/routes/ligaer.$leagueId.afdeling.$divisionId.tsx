import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Calendar, MapPin, Trash2, MessageSquareWarning } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CAR_CLASSES, DRIVER_CATEGORIES } from "@/lib/tracks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/ligaer/$leagueId/afdeling/$divisionId")({
  component: DivisionDetail,
});

function DivisionDetail() {
  const { leagueId, divisionId } = useParams({ from: "/ligaer/$leagueId/afdeling/$divisionId" });
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: div } = useQuery({
    queryKey: ["division", divisionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("divisions").select("*").eq("id", divisionId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["entries", divisionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries").select("*").eq("division_id", divisionId).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const myEntry = entries?.find((e) => e.user_id === user?.id);

  const grouped = (entries ?? []).reduce<Record<string, Record<string, typeof entries>>>((acc, e) => {
    acc[e.car_class] ??= {};
    acc[e.car_class][e.driver_category] ??= [];
    acc[e.car_class][e.driver_category]!.push(e);
    return acc;
  }, {});

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["entries", divisionId] }); toast.success("Tilmelding fjernet"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Link to="/ligaer/$leagueId" params={{ leagueId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tilbage
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{div?.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {div?.car_class && <Badge>{div.car_class}</Badge>}
          {div?.driver_category && <Badge variant="secondary">{div.driver_category}</Badge>}
          {div?.track && <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" />{div.track}{div.layout ? ` · ${div.layout}` : ""}</Badge>}
          {div?.race_date && <Badge variant="outline" className="gap-1"><Calendar className="h-3 w-3" />{format(new Date(div.race_date), "dd MMM yyyy HH:mm")}</Badge>}
        </div>
      </div>

      {div?.settings && Object.keys(div.settings as any).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Settings</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {Object.entries(div.settings as Record<string, any>).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{String(v)}</dd></div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {!user && (
          <Button onClick={() => navigate({ to: "/login" })}>Log ind for at tilmelde</Button>
        )}
        {user && !myEntry && <EntryDialog divisionId={divisionId} defaultClass={div?.car_class} defaultCategory={div?.driver_category} />}
        {user && <ProtestDialog divisionId={divisionId} />}
        {user && myEntry && (
          <Button variant="outline" size="sm" onClick={() => deleteEntry.mutate(myEntry.id)} className="gap-1">
            <Trash2 className="h-4 w-4" /> Fjern min tilmelding
          </Button>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Tilmeldte kørere ({entries?.length ?? 0})</h2>
        {entries?.length === 0 && <p className="text-sm text-muted-foreground">Ingen tilmeldt endnu.</p>}
        <div className="space-y-4">
          {Object.entries(grouped).map(([cls, cats]) => (
            <Card key={cls}>
              <CardHeader><CardTitle className="text-base">{cls}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(cats).map(([cat, list]) => (
                  <div key={cat}>
                    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{cat}</p>
                    <ul className="space-y-1">
                      {list!.map((e) => (
                        <li key={e.id} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm">
                          <span>{e.driver_name}</span>
                          {e.user_id === user?.id && (
                            <Button variant="ghost" size="sm" onClick={() => deleteEntry.mutate(e.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function EntryDialog({ divisionId, defaultClass, defaultCategory }: { divisionId: string; defaultClass?: string | null; defaultCategory?: string | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [carClass, setCarClass] = useState(defaultClass || CAR_CLASSES[0]);
  const [category, setCategory] = useState(defaultCategory || DRIVER_CATEGORIES[0]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("entries").insert({
      division_id: divisionId, user_id: user.id, driver_name: name.trim(),
      car_class: carClass, driver_category: category,
    });
    if (error) toast.error(error.message);
    else { toast.success("Tilmeldt!"); setOpen(false); setName(""); qc.invalidateQueries({ queryKey: ["entries", divisionId] }); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Tilmeld dig</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Tilmeld dig afdelingen</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Kørernavn</Label><Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Bilklasse</Label>
            <Select value={carClass} onValueChange={setCarClass}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CAR_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Kategori</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DRIVER_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter><Button type="submit">Tilmeld</Button></DialogFooter>
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
  const [involved, setInvolved] = useState("");
  const [desc, setDesc] = useState("");
  const [video, setVideo] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (video && !/^https?:\/\//i.test(video)) { toast.error("Video link skal være en gyldig URL"); return; }
    const { error } = await supabase.from("protests").insert({
      division_id: divisionId, submitted_by: user.id,
      lap_number: lap ? Number(lap) : null,
      corner: corner.trim() || null,
      involved_drivers: involved.trim() || null,
      description: desc.trim(), video_url: video.trim() || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Protest indsendt"); setOpen(false); setLap(""); setCorner(""); setInvolved(""); setDesc(""); setVideo(""); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="gap-1"><MessageSquareWarning className="h-4 w-4" /> Indsend protest</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Indsend protest</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Omgang</Label><Input type="number" min={1} value={lap} onChange={(e) => setLap(e.target.value)} /></div>
            <div><Label>Sving</Label><Input maxLength={50} value={corner} onChange={(e) => setCorner(e.target.value)} placeholder="fx T7" /></div>
          </div>
          <div><Label>Involverede kørere</Label><Input maxLength={200} value={involved} onChange={(e) => setInvolved(e.target.value)} placeholder="Navne, kommasepareret" /></div>
          <div><Label>Beskrivelse</Label><Textarea required maxLength={2000} value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} /></div>
          <div><Label>Video-link (valgfri)</Label><Input type="url" maxLength={500} value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://…" /></div>
          <DialogFooter><Button type="submit">Send</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
