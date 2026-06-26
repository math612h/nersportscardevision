import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Check, Upload, Film, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LMU_TRACKS, WEATHER_OPTIONS, WEATHER_BY_KEY, WEATHER_SLOT_COUNT, type WeatherKey, type EventSettings } from "@/lib/tracks";
import { SessionSettingsEditor } from "@/components/SessionSettingsEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PracticeSessionsAdmin } from "@/components/PracticeSessionsAdmin";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer/$leagueId/afdelinger")({
  component: AdminDivisions,
});

function AdminDivisions() {
  const { leagueId } = useParams({ from: "/_authenticated/_admin/admin/ligaer/$leagueId/afdelinger" });
  const qc = useQueryClient();

  const { data: league } = useQuery({
    queryKey: ["league-admin", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: divisions } = useQuery({
    queryKey: ["divisions-admin", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("divisions").select("*").eq("league_id", leagueId).order("race_date");
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("divisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slettet"); qc.invalidateQueries({ queryKey: ["divisions-admin", leagueId] }); },
  });

  return (
    <div className="space-y-4">
      <Link to="/admin/ligaer" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-3 w-3" /> Ligaer</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Afdelinger</h1>
          {league && (
            <div className="mt-1 flex gap-2 text-sm text-muted-foreground">
              <span>{league.name}</span>
              {league.car_class && <Badge variant="outline">{league.car_class}</Badge>}
              {league.driver_category && <Badge variant="outline">{league.driver_category}</Badge>}
            </div>
          )}
        </div>
        {league && <DivisionDialog leagueId={leagueId} carClass={league.car_class} category={league.driver_category} onDone={() => qc.invalidateQueries({ queryKey: ["divisions-admin", leagueId] })} />}
      </div>

      {divisions?.length === 0 && <p className="text-muted-foreground">Ingen afdelinger endnu.</p>}
      <div className="space-y-3">
        {divisions?.map((d: any) => {
          const slots: WeatherKey[] = Array.isArray(d.settings?.weather) ? d.settings.weather : [];
          const completed = !!d.settings?.completed;
          const flPts = Number(d.settings?.fastest_lap_points ?? 0);
          return (
            <Card key={d.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {d.name}
                    {completed && <Badge variant="secondary" className="gap-1 text-[10px]"><Check className="h-3 w-3" />Afsluttet</Badge>}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button asChild variant="ghost" size="sm" title="Upload resultater">
                      <Link to="/admin/ligaer/$leagueId/afdelinger/$divisionId/upload" params={{ leagueId, divisionId: d.id }}>
                        <Upload className="h-4 w-4" /> Upload resultater
                      </Link>
                    </Button>
                    <ReplayFileButton divisionId={d.id} />
                    <EditDivisionDialog division={d} onDone={() => qc.invalidateQueries({ queryKey: ["divisions-admin", leagueId] })} />
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Slet afdeling?")) del.mutate(d.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  {d.track && <Badge variant="outline">{d.track}{d.layout ? ` · ${d.layout}` : ""}</Badge>}
                  {d.race_date && <Badge variant="outline">{format(new Date(d.race_date), "dd MMM yyyy HH:mm")}</Badge>}
                  {d.settings?.temperature != null && <Badge variant="outline">{d.settings.temperature}°C</Badge>}
                  <Badge variant="outline">FL: {flPts} p</Badge>
                </div>
                {slots.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {slots.map((key, i) => {
                      const w = WEATHER_BY_KEY[key];
                      if (!w) return null;
                      const Icon = w.icon;
                      return (
                        <span key={i} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs">
                          <Icon className="h-3 w-3" /> {w.label}
                        </span>
                      );
                    })}
                  </div>
                )}
                <PracticeSessionsAdmin divisionId={d.id} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DivisionDialog({ leagueId, carClass, category, onDone }: { leagueId: string; carClass: string | null; category: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trackLayout, setTrackLayout] = useState(`0::${LMU_TRACKS[0].layouts[0]}`);
  const [raceDate, setRaceDate] = useState("");
  const [weather, setWeather] = useState<WeatherKey[]>(Array(WEATHER_SLOT_COUNT).fill("sunny"));
  const [temperature, setTemperature] = useState<number>(22);
  const [flPoints, setFlPoints] = useState<number>(1);
  const [lobbyCode, setLobbyCode] = useState("");
  const [lobbyPassword, setLobbyPassword] = useState("");
  const [serverName, setServerName] = useState("");
  const [eventSettings, setEventSettings] = useState<EventSettings>({});

  const [trackIdxStr, layout] = trackLayout.split("::");
  const track = LMU_TRACKS[Number(trackIdxStr)];

  const setSlot = (i: number, v: WeatherKey) => setWeather((prev) => prev.map((w, idx) => (idx === i ? v : w)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: inserted, error } = await supabase.from("divisions").insert({
      league_id: leagueId, name: name.trim(),
      car_class: carClass, driver_category: category,
      track: track.name, layout,
      race_date: raceDate ? new Date(raceDate).toISOString() : null,
      settings: {
        weather,
        fastest_lap_points: flPoints,
        temperature,
        event_settings: eventSettings,
      },
    }).select("id").single();
    if (error) return toast.error(error.message);
    if (inserted && (lobbyCode.trim() || lobbyPassword.trim() || serverName.trim())) {
      const { error: lErr } = await supabase.from("division_lobbies").insert({
        division_id: inserted.id,
        lobby_code: lobbyCode.trim() || null,
        lobby_password: lobbyPassword.trim() || null,
        server_name: serverName.trim() || null,
      } as any);
      if (lErr) return toast.error(`Afdeling oprettet, men lobby fejlede: ${lErr.message}`);
    }
    toast.success("Afdeling oprettet");
    setOpen(false); setName(""); setRaceDate("");
    setWeather(Array(WEATHER_SLOT_COUNT).fill("sunny"));
    setTemperature(22); setFlPoints(1);
    setLobbyCode(""); setLobbyPassword(""); setServerName("");
    setEventSettings({});
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Ny afdeling</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Opret afdeling</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="fx Round 1 – Spa" /></div>
          <div><Label>Bane & layout</Label>
            <Select value={trackLayout} onValueChange={setTrackLayout}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                {LMU_TRACKS.map((t, i) => (
                  <SelectGroup key={t.name}>
                    <SelectLabel>{t.name}</SelectLabel>
                    {t.layouts.map((l) => (
                      <SelectItem key={`${i}::${l}`} value={`${i}::${l}`}>{l}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Dato & tid</Label><Input type="datetime-local" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} /></div>
          <div>
            <Label>Point for hurtigste omgang (pr. klasse)</Label>
            <Input type="number" min={0} max={50} value={flPoints} onChange={(e) => setFlPoints(Number(e.target.value))} />
            <p className="mt-1 text-xs text-muted-foreground">Tildeles til den hurtigste i hver klasse (Hypercar Pro/Am, LMGT3 Pro/Am osv.).</p>
          </div>
          <div>
            <Label>Temperatur (°C)</Label>
            <Input type="number" min={-20} max={50} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
            <p className="mt-1 text-xs text-muted-foreground">Lufttemperatur for løbet.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lobby code</Label>
              <Input maxLength={50} value={lobbyCode} onChange={(e) => setLobbyCode(e.target.value)} placeholder="fx ABC123" />
            </div>
            <div>
              <Label>Password</Label>
              <Input maxLength={50} value={lobbyPassword} onChange={(e) => setLobbyPassword(e.target.value)} placeholder="Lobby password" />
            </div>
          </div>
          <div>
            <Label>Server navn</Label>
            <Input maxLength={100} value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder="fx LMU Danmark #1" />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Vises kun for kørere med godkendt profil.</p>
          <div className="space-y-2">
            <Label>Vejr (5 slots)</Label>
            <div className="space-y-2">
              {weather.map((val, i) => {
                const current = WEATHER_BY_KEY[val];
                const CurrentIcon = current?.icon;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-14 text-xs text-muted-foreground">Slot {i + 1}</span>
                    {CurrentIcon && <CurrentIcon className="h-4 w-4 text-muted-foreground" />}
                    <Select value={val} onValueChange={(v) => setSlot(i, v as WeatherKey)}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEATHER_OPTIONS.map((w) => {
                          const Icon = w.icon;
                          return (
                            <SelectItem key={w.key} value={w.key}>
                              <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" /> {w.label}</span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
          <SessionSettingsEditor value={eventSettings} onChange={setEventSettings} />
          <DialogFooter><Button type="submit">Opret</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditDivisionDialog({ division, onDone }: { division: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [flPoints, setFlPoints] = useState<number>(Number(division.settings?.fastest_lap_points ?? 1));
  const [temperature, setTemperature] = useState<number>(Number(division.settings?.temperature ?? 22));
  const [completed, setCompleted] = useState<boolean>(!!division.settings?.completed);
  const [raceDate, setRaceDate] = useState<string>(toLocalInput(division.race_date ?? null));
  const [lobbyCode, setLobbyCode] = useState<string>("");
  const [lobbyPassword, setLobbyPassword] = useState<string>("");
  const [serverName, setServerName] = useState<string>("");
  const [serverStartedAt, setServerStartedAt] = useState<string | null>(
    (division as any).server_started_at ?? null,
  );
  const [eventSettings, setEventSettings] = useState<EventSettings>(
    (division.settings?.event_settings && typeof division.settings.event_settings === "object" ? division.settings.event_settings : {}) as EventSettings,
  );

  useQuery({
    queryKey: ["admin-division-lobby", division.id, open],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("division_lobbies")
        .select("lobby_code,lobby_password,server_name")
        .eq("division_id", division.id)
        .maybeSingle();
      if (error) throw error;
      setLobbyCode(String(data?.lobby_code ?? ""));
      setLobbyPassword(String(data?.lobby_password ?? ""));
      setServerName(String((data as any)?.server_name ?? ""));
      return data ?? null;
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newSettings = {
      ...(division.settings ?? {}),
      fastest_lap_points: flPoints,
      temperature,
      completed,
      event_settings: eventSettings,
    };
    // Ensure stale lobby fields aren't kept in settings
    delete (newSettings as any).lobby_code;
    delete (newSettings as any).lobby_password;
    const updatePayload: any = { settings: newSettings };
    if (raceDate) updatePayload.race_date = new Date(raceDate).toISOString();
    else updatePayload.race_date = null;
    const { error } = await supabase.from("divisions").update(updatePayload).eq("id", division.id);
    if (error) return toast.error(error.message);

    const code = lobbyCode.trim() || null;
    const pw = lobbyPassword.trim() || null;
    const sn = serverName.trim() || null;
    const { error: lErr } = await supabase
      .from("division_lobbies")
      .upsert({ division_id: division.id, lobby_code: code, lobby_password: pw, server_name: sn, updated_at: new Date().toISOString() } as any, { onConflict: "division_id" });
    if (lErr) return toast.error(`Lobby kunne ikke gemmes: ${lErr.message}`);

    toast.success("Opdateret");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Rediger {division.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Dato & tid</Label>
            <Input type="datetime-local" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} />
          </div>
          <div>
            <Label>Point for hurtigste omgang (pr. klasse)</Label>
            <Input type="number" min={0} max={50} value={flPoints} onChange={(e) => setFlPoints(Number(e.target.value))} />
          </div>
          <div>
            <Label>Temperatur (°C)</Label>
            <Input type="number" min={-20} max={50} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lobby code</Label>
              <Input maxLength={50} value={lobbyCode} onChange={(e) => setLobbyCode(e.target.value)} placeholder="fx ABC123" />
            </div>
            <div>
              <Label>Password</Label>
              <Input maxLength={50} value={lobbyPassword} onChange={(e) => setLobbyPassword(e.target.value)} placeholder="Lobby password" />
            </div>
          </div>
          <div>
            <Label>Server navn</Label>
            <Input maxLength={100} value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder="fx LMU Danmark #1" />
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">Vises kun for kørere med godkendt profil. Afdelingen markeres automatisk som LIVE i 4 timer fra løbets starttidspunkt.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
            Marker som afsluttet
          </label>
          <SessionSettingsEditor value={eventSettings} onChange={setEventSettings} />
          <DialogFooter><Button type="submit">Gem</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function ReplayFileButton({ divisionId }: { divisionId: string }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const { data: files, refetch } = useQuery({
    queryKey: ["division-replays", divisionId, open],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("division-replays").list(divisionId, {
        sortBy: { column: "created_at", order: "desc" },
        limit: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 500_000_000) { toast.error("Filen er for stor (max 500 MB)"); return; }
    setBusy(true);
    try {
      const path = `${divisionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("division-replays").upload(path, file, { upsert: false });
      if (error) throw error;
      toast.success("Replay uploadet");
      await refetch();
      qc.invalidateQueries({ queryKey: ["division-replays", divisionId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Upload fejlede");
    } finally {
      setBusy(false);
    }
  };

  const download = async (name: string) => {
    const { data, error } = await supabase.storage.from("division-replays").createSignedUrl(`${divisionId}/${name}`, 300);
    if (error || !data) return toast.error(error?.message ?? "Kunne ikke hente fil");
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (name: string) => {
    if (!confirm("Slet replay?")) return;
    const { error } = await supabase.storage.from("division-replays").remove([`${divisionId}/${name}`]);
    if (error) return toast.error(error.message);
    toast.success("Slettet");
    refetch();
  };

  const displayName = (name: string) => name.replace(/^\d+-/, "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Replay fil"><Film className="h-4 w-4" /> Replay</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Replay filer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <input ref={fileRef} type="file" className="hidden" onChange={onUpload} />
          <Button disabled={busy} onClick={() => fileRef.current?.click()} className="gap-1">
            <Upload className="h-4 w-4" /> {busy ? "Uploader…" : "Upload replay fil"}
          </Button>
          <p className="text-xs text-muted-foreground">Max 500 MB. Andre admins kan hente filen.</p>
          <div className="space-y-1">
            {files?.length === 0 && <p className="text-sm text-muted-foreground">Ingen filer endnu.</p>}
            {files?.map((f) => (
              <div key={f.name} className="flex items-center justify-between gap-2 rounded border border-border p-2 text-sm">
                <span className="truncate">{displayName(f.name)}</span>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => download(f.name)}><Download className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(f.name)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
