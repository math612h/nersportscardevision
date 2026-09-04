import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy, Timer, Pencil } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PracticeSessionsAdmin({ divisionId }: { divisionId: string }) {
  const qc = useQueryClient();
  const { data: sessions } = useQuery({
    queryKey: ["practice-sessions-admin", divisionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("division_practice_sessions" as any)
        .select("id,division_id,server_name,has_qualifying,has_race,practice_minutes,qualifying_minutes,race_minutes,starts_at,settings,created_at,updated_at")
        .eq("division_id", divisionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const { data: creds } = await supabase.rpc("get_division_practice_credentials", { _division_id: divisionId });
      const byId = new Map<string, any>((Array.isArray(creds) ? creds : []).map((c: any) => [c.id, c]));
      return ((data ?? []) as any[]).map((s) => ({ ...s, ...(byId.get(s.id) ?? {}) }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["practice-sessions-admin", divisionId] });

  const remove = async (id: string) => {
    if (!confirm("Slet practice session?")) return;
    const { error } = await supabase.from("division_practice_sessions" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Slettet");
    refresh();
  };

  return (
    <div className="space-y-2 rounded border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Practice sessions</div>
        <PracticeSessionDialog divisionId={divisionId} onDone={refresh} />
      </div>
      {(sessions ?? []).length === 0 && <p className="text-xs text-muted-foreground">Ingen practice servere endnu.</p>}
      <ul className="space-y-1">
        {(sessions ?? []).map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-2 rounded border border-border bg-background/60 p-2 text-xs">
            <div className="space-y-0.5">
              <div className="font-medium">{s.server_name || "Practice server"}</div>
              <div className="text-muted-foreground">
                {s.starts_at && <>Start: {format(new Date(s.starts_at), "dd MMM HH:mm")} · </>}
                P: {s.practice_minutes ?? "—"}m
                {s.has_qualifying && <> · Q: {s.qualifying_minutes ?? "—"}m</>}
                {s.has_race && <> · R: {s.race_minutes ?? "—"}m</>}
              </div>
              {(s.lobby_code || s.lobby_password) && (
                <div className="font-mono text-[10px] text-muted-foreground">
                  {s.lobby_code && <>Code: {s.lobby_code} </>}
                  {s.lobby_password && <>· Pw: {s.lobby_password}</>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <PracticeSessionDialog divisionId={divisionId} session={s} onDone={refresh} />
              <Button variant="ghost" size="sm" onClick={() => remove(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PracticeSessionDialog({ divisionId, session, onDone }: { divisionId: string; session?: any; onDone: () => void }) {
  const isEdit = Boolean(session?.id);
  const [open, setOpen] = useState(false);
  const [serverName, setServerName] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");
  const [lobbyPassword, setLobbyPassword] = useState("");
  const [hasQualifying, setHasQualifying] = useState(false);
  const [hasRace, setHasRace] = useState(false);
  const [practiceMinutes, setPracticeMinutes] = useState<number>(60);
  const [qualifyingMinutes, setQualifyingMinutes] = useState<number>(15);
  const [raceMinutes, setRaceMinutes] = useState<number>(30);
  const [startsAt, setStartsAt] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setServerName(session?.server_name ?? "");
    setLobbyCode(session?.lobby_code ?? "");
    setLobbyPassword(session?.lobby_password ?? "");
    setHasQualifying(Boolean(session?.has_qualifying));
    setHasRace(Boolean(session?.has_race));
    setPracticeMinutes(Number(session?.practice_minutes ?? 60));
    setQualifyingMinutes(Number(session?.qualifying_minutes ?? 15));
    setRaceMinutes(Number(session?.race_minutes ?? 30));
    setStartsAt(toLocalInput(session?.starts_at));
  };

  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.id]);

  const duplicateFromDivision = async () => {
    const { data: div, error: dErr } = await supabase
      .from("divisions").select("settings, race_date").eq("id", divisionId).maybeSingle();
    if (dErr) return toast.error(dErr.message);
    const { data: lobbyRows } = await supabase.rpc("get_division_lobby", { _division_id: divisionId });
    const lobby = (Array.isArray(lobbyRows) ? lobbyRows[0] ?? null : null) as { server_name: string | null; lobby_password: string | null } | null;
    if (lobby?.server_name) setServerName(lobby.server_name);
    if (lobby?.lobby_password) setLobbyPassword(lobby.lobby_password);
    const evt = (div?.settings as any)?.event_settings ?? {};
    if (evt.race_minutes) setRaceMinutes(Number(evt.race_minutes));
    if (evt.qualifying_minutes) setQualifyingMinutes(Number(evt.qualifying_minutes));
    if (evt.practice_minutes) setPracticeMinutes(Number(evt.practice_minutes));
    toast.success("Settings kopieret fra afdelingen — husk at indtaste lobby code");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      server_name: serverName.trim() || null,
      lobby_code: lobbyCode.trim() || null,
      lobby_password: lobbyPassword.trim() || null,
      has_qualifying: hasQualifying,
      has_race: hasRace,
      practice_minutes: practiceMinutes,
      qualifying_minutes: hasQualifying ? qualifyingMinutes : null,
      race_minutes: hasRace ? raceMinutes : null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
    };
    const { error } = isEdit
      ? await supabase.from("division_practice_sessions" as any).update(payload).eq("id", session.id)
      : await supabase.from("division_practice_sessions" as any).insert({ division_id: divisionId, ...payload });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Practice session opdateret" : "Practice session oprettet");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm" aria-label="Redigér practice session"><Pencil className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"><Plus className="h-3 w-3" /> Tilføj practice server</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Redigér practice server" : "Ny practice server"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={duplicateFromDivision}>
            <Copy className="h-3.5 w-3.5" /> Dupliker afdelings settings
          </Button>
          <p className="-mt-1 text-xs text-muted-foreground">Banen er automatisk den samme som afdelingen.</p>

          <div>
            <Label>Server navn</Label>
            <Input maxLength={100} value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder="fx LMU DK Practice" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lobby code</Label>
              <Input maxLength={50} value={lobbyCode} onChange={(e) => setLobbyCode(e.target.value)} placeholder="Indtast manuelt" />
            </div>
            <div>
              <Label>Password</Label>
              <Input maxLength={50} value={lobbyPassword} onChange={(e) => setLobbyPassword(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Start tid (valgfri)</Label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Bruges til nedtælling i kalenderen.</p>
          </div>

          <div className="space-y-2 rounded border border-border p-3">
            <div>
              <Label>Practice længde (min)</Label>
              <Input type="number" min={1} max={600} value={practiceMinutes} onChange={(e) => setPracticeMinutes(Number(e.target.value))} />
            </div>
            <label className="flex items-center justify-between gap-2 text-sm pt-2">
              <span>Inkludér qualifying</span>
              <Switch checked={hasQualifying} onCheckedChange={setHasQualifying} />
            </label>
            {hasQualifying && (
              <div>
                <Label>Qualifying længde (min)</Label>
                <Input type="number" min={1} max={600} value={qualifyingMinutes} onChange={(e) => setQualifyingMinutes(Number(e.target.value))} />
              </div>
            )}
            <label className="flex items-center justify-between gap-2 text-sm pt-2">
              <span>Inkludér race</span>
              <Switch checked={hasRace} onCheckedChange={setHasRace} />
            </label>
            {hasRace && (
              <div>
                <Label>Race længde (min)</Label>
                <Input type="number" min={1} max={600} value={raceMinutes} onChange={(e) => setRaceMinutes(Number(e.target.value))} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving} className="gap-1">
              <Timer className="h-4 w-4" /> {isEdit ? "Gem" : "Opret"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
