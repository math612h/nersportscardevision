import { createFileRoute, Link } from "@tanstack/react-router";
import { CoachingAccessGate } from "@/components/CoachingAccessGate";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COACHING_FOCUS_POINTS } from "@/lib/coaching-focus-points";
import {
  getMyCoachProfile, upsertMyCoachProfile,
  listCoachAvailability, addCoachAvailability, deleteCoachAvailability,
} from "@/lib/coaching.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/coaching/min-profil")({
  component: () => <CoachingAccessGate><MyCoachProfilePage /></CoachingAccessGate>,
});

const WEEKDAYS = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];

function MyCoachProfilePage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyCoachProfile);
  const saveFn = useServerFn(upsertMyCoachProfile);

  const { data, isLoading } = useQuery({ queryKey: ["my-coach-profile"], queryFn: () => getFn() });

  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [newAch, setNewAch] = useState("");

  useEffect(() => {
    if (data?.profile) {
      setBio(data.profile.bio ?? "");
      setSpecialties(data.profile.specialties ?? []);
      setAchievements(data.profile.achievements ?? []);
      setActive(!!data.profile.active);
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { bio, specialties, achievements, active } }),
    onSuccess: () => {
      toast.success("Profil gemt");
      qc.invalidateQueries({ queryKey: ["my-coach-profile"] });
      qc.invalidateQueries({ queryKey: ["coaches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Indlæser…</div>;
  if (!data?.hasCoachRole) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Du har ikke coach-rollen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Bed en admin om at tildele dig coach-rollen.</p>
        <Button asChild className="mt-6" variant="outline"><Link to="/coaching">Tilbage til Coaching</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Min coach-profil</h1>
        <div className="mt-2 flex gap-3 text-sm">
          <Link to="/coaching/min-kalender" className="text-primary hover:underline">→ Min kalender</Link>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Profil</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Aktiv</div>
              <p className="text-xs text-muted-foreground">Når slået fra vises du ikke i listen over coaches.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Bio</label>
            <Textarea rows={5} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Beskriv kort dig selv og din coaching-stil…" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Specialer (vælg dine fokuspunkter)</label>
            <div className="flex flex-wrap gap-2">
              {COACHING_FOCUS_POINTS.map((fp) => {
                const sel = specialties.includes(fp);
                return (
                  <button
                    key={fp}
                    type="button"
                    onClick={() => setSpecialties((cur) => sel ? cur.filter((s) => s !== fp) : [...cur, fp])}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      sel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
                    )}
                  >
                    {fp}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Achievements</label>
            <div className="space-y-2">
              {achievements.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={a} onChange={(e) => setAchievements((cur) => cur.map((x, j) => j === i ? e.target.value : x))} />
                  <Button variant="outline" size="icon" onClick={() => setAchievements((cur) => cur.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input value={newAch} onChange={(e) => setNewAch(e.target.value)} placeholder="Fx '24h Le Mans 2024 — P3 LMP3'" />
                <Button variant="outline" onClick={() => { if (newAch.trim()) { setAchievements((cur) => [...cur, newAch.trim()]); setNewAch(""); } }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="pt-2">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              <Save className="mr-1 h-4 w-4" /> Gem profil
            </Button>
          </div>
        </CardContent>
      </Card>

      <AvailabilityEditor />
    </div>
  );
}

function AvailabilityEditor() {
  const qc = useQueryClient();
  const getMy = useServerFn(getMyCoachProfile);
  const { data: prof } = useQuery({ queryKey: ["my-coach-profile-id"], queryFn: () => getMy() });
  // We don't have userId on client easily; reuse list with own id. We can fetch via /me/profile differently:
  // Simplest: use a server fn that returns own availability via my role. Instead, query by self.
  const listFn = useServerFn(listCoachAvailability);
  const addFn = useServerFn(addCoachAvailability);
  const delFn = useServerFn(deleteCoachAvailability);

  // We need the coach's own user_id. Pull from supabase client directly.
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
    })();
  }, []);

  const { data: rows = [] } = useQuery({
    queryKey: ["my-availability", meId],
    queryFn: () => listFn({ data: { coach_user_id: meId! } }),
    enabled: !!meId,
  });

  const [mode, setMode] = useState<"recurring" | "specific">("recurring");
  const [weekday, setWeekday] = useState("1");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");

  const addMut = useMutation({
    mutationFn: () => addFn({ data: {
      weekday: mode === "recurring" ? Number(weekday) : null,
      specific_date: mode === "specific" ? date : null,
      start_time: start,
      end_time: end,
    } }),
    onSuccess: () => {
      toast.success("Tidsrum tilføjet");
      qc.invalidateQueries({ queryKey: ["my-availability"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-availability"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!prof?.hasCoachRole) return null;

  return (
    <Card>
      <CardHeader><CardTitle>Tilgængelighed</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border p-3">
          <div className="mb-3 flex gap-2">
            <Button size="sm" variant={mode === "recurring" ? "default" : "outline"} onClick={() => setMode("recurring")}>Ugentlig</Button>
            <Button size="sm" variant={mode === "specific" ? "default" : "outline"} onClick={() => setMode("specific")}>Specifik dato</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {mode === "recurring" ? (
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((w, i) => <SelectItem key={i} value={String(i)}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            <Button onClick={() => addMut.mutate()} disabled={addMut.isPending || (mode === "specific" && !date)}>
              <Plus className="mr-1 h-4 w-4" /> Tilføj
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Ingen tidsrum endnu.</p>}
          {rows.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-sm">
              <div>
                <span className="font-medium">
                  {r.specific_date ? new Date(r.specific_date).toLocaleDateString("da-DK", { weekday: "short", day: "2-digit", month: "long" })
                    : `Hver ${WEEKDAYS[r.weekday]}`}
                </span>
                <span className="ml-2 text-muted-foreground">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => delMut.mutate(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
