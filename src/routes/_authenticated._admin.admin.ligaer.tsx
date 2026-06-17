import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowLeft, Plus, Trash2, Settings, Pencil, ImagePlus, Archive, ArchiveRestore, Send, ArrowUp, ArrowDown, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { sendLeagueAnnouncement } from "@/lib/league-announce.functions";
import { syncDiscordRolesForLeague } from "@/lib/discord-sync.functions";

import {
  CAR_CLASSES,
  DRIVER_CATEGORIES,
  EVENT_AID_FIELDS,
  ON_OFF_OPTIONS,
  type ClassConfig,
  type EventSettings,
  type OnOff,
} from "@/lib/tracks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PointsSystemEditor, type PointsSystem } from "@/components/PointsSystemEditor";

async function uploadLeagueBanner(file: File): Promise<string> {
  if (file.size > 8 * 1024 * 1024) throw new Error("Billedet må højst være 8 MB.");
  if (!file.type.startsWith("image/")) throw new Error("Vælg en billedfil.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `banner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("league-banners").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(error.message);
  return path;
}

function BannerPicker({ pathOrUrl, file, onFile, onClear }: { pathOrUrl: string | null; file: File | null; onFile: (f: File | null) => void; onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const { data: previewUrl } = useQuery({
    queryKey: ["banner-preview", pathOrUrl],
    enabled: !!pathOrUrl && !pathOrUrl.startsWith("http"),
    queryFn: async () => {
      const { data } = await supabase.storage.from("league-banners").createSignedUrl(pathOrUrl!, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
  const localUrl = file ? URL.createObjectURL(file) : null;
  const src = localUrl || (pathOrUrl?.startsWith("http") ? pathOrUrl : previewUrl);
  return (
    <div className="space-y-2">
      <Label>Billede til liga-knap</Label>
      {src ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-border bg-muted">
          <img src={src} alt="Banner" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-[16/9] w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          Intet billede
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => ref.current?.click()}>
          <ImagePlus className="h-3 w-3" /> Vælg billede
        </Button>
        {(file || pathOrUrl) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { onFile(null); onClear(); if (ref.current) ref.current.value = ""; }}>
            Fjern
          </Button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0] ?? null; onFile(f); }}
      />
    </div>
  );
}

function ClassConfigsEditor({ configs, setConfigs }: { configs: ClassConfig[]; setConfigs: (cb: (prev: ClassConfig[]) => ClassConfig[]) => void }) {
  const update = (i: number, patch: Partial<ClassConfig>) =>
    setConfigs((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => setConfigs((prev) => prev.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <Label>Bilklasser og kørenumre</Label>
      {configs.map((c, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Klasse {i + 1}</span>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={configs.length === 1}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Klasse</Label>
              <Select value={c.car_class} onValueChange={(v) => update(i, { car_class: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CAR_CLASSES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Kategori</Label>
              <Select value={c.driver_category} onValueChange={(v) => update(i, { driver_category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DRIVER_CATEGORIES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fra nr.</Label>
              <Input type="number" min={1} value={c.number_from} onChange={(e) => update(i, { number_from: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Til nr.</Label>
              <Input type="number" min={1} value={c.number_to} onChange={(e) => update(i, { number_to: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Maks. deltagere</Label>
              <Input type="number" min={1} value={c.max_drivers ?? ""} placeholder="Ubegrænset" onChange={(e) => update(i, { max_drivers: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">DNS-grænse</Label>
              <Input type="number" min={1} value={c.dns_limit ?? ""} placeholder="Ingen" onChange={(e) => update(i, { dns_limit: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full gap-1" onClick={() => setConfigs((p) => [...p, emptyConfig()])}>
        <Plus className="h-3 w-3" /> Tilføj klasse
      </Button>
    </div>
  );
}

function DriverAidsEditor({ value, onChange }: { value: EventSettings; onChange: (next: EventSettings) => void }) {
  const patch = (p: Partial<EventSettings>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Label>Driver Aids</Label>
      <div className="grid grid-cols-2 gap-2 pt-1">
        {EVENT_AID_FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="text-xs">{f.label}</Label>
            <Select
              value={(value[f.key] as OnOff | undefined) ?? ""}
              onValueChange={(v) => patch({ [f.key]: (v || undefined) as OnOff | undefined } as Partial<EventSettings>)}
            >
              <SelectTrigger><SelectValue placeholder="–" /></SelectTrigger>
              <SelectContent>{ON_OFF_OPTIONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

function BriefingOpenEditor({ value, onChange }: { value: EventSettings; onChange: (next: EventSettings) => void }) {
  const current = value.briefing_open_minutes_before ?? 30;
  return (
    <div className="space-y-1 rounded-md border border-border p-2">
      <Label>Drivers Briefing åbner (min før løbsstart)</Label>
      <Input
        type="number"
        min={0}
        max={1440}
        value={current}
        onChange={(e) => onChange({ ...value, briefing_open_minutes_before: Number(e.target.value) })}
      />
      <p className="text-xs text-muted-foreground">Nedtælling vises på knappen indtil kanalen åbner. Admins har altid adgang.</p>
    </div>
  );
}

function CarLockEditor({
  never,
  at,
  onNever,
  onAt,
}: {
  never: boolean;
  at: string;
  onNever: (v: boolean) => void;
  onAt: (v: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Label>Lås af bilvalg</Label>
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox checked={never} onCheckedChange={(v) => onNever(v === true)} />
        <span className="text-sm">Bilvalg låses aldrig (deltagere kan altid skifte bil)</span>
      </label>
      <div className={never ? "opacity-50 pointer-events-none" : ""}>
        <Label className="text-xs">Lås bilvalg fra og med</Label>
        <Input
          type="datetime-local"
          value={at}
          onChange={(e) => onAt(e.target.value)}
          disabled={never}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Vælg dato og tid. Når tidspunktet er nået, kan deltagerne ikke længere ændre bil. Lad være tom for at undlade at låse.
        </p>
      </div>
    </div>
  );
}




export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer")({
  component: AdminLeagues,
});

function emptyConfig(): ClassConfig {
  return { car_class: CAR_CLASSES[0], driver_category: DRIVER_CATEGORIES[0], number_from: 1, number_to: 50, max_drivers: 20, dns_limit: 2 };
}

function validateConfigs(configs: ClassConfig[]): string | null {
  if (configs.length === 0) return "Tilføj mindst én bilklasse.";
  for (const c of configs) {
    if (!c.car_class || !c.driver_category) return "Udfyld klasse og kategori.";
    if (!Number.isInteger(c.number_from) || !Number.isInteger(c.number_to) || c.number_from < 1 || c.number_to < c.number_from)
      return "Ugyldigt nummerinterval.";
  }
  return null;
}

function AdminLeagues() {
  const { user } = useAuth();
  const location = useLocation();
  const isLeagueList = location.pathname === "/admin/ligaer";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isOffseason, setIsOffseason] = useState(false);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [briefingRequired, setBriefingRequired] = useState(true);
  const [separateDivisionStandings, setSeparateDivisionStandings] = useState(false);
  const [protestTickets, setProtestTickets] = useState<number>(3);
  const [configs, setConfigs] = useState<ClassConfig[]>([emptyConfig()]);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [eventSettings, setEventSettings] = useState<EventSettings>({});
  const [pointsSystem, setPointsSystem] = useState<PointsSystem>({});
  const [signupOpensAt, setSignupOpensAt] = useState<string>("");
  const [carLockNever, setCarLockNever] = useState<boolean>(false);
  const [carLockAt, setCarLockAt] = useState<string>("");
  const [createdLeague, setCreatedLeague] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const { data: leagues } = useQuery({
    queryKey: ["leagues-admin", showArchive],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*")
        .eq("published", !showArchive)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const reorder = useMutation({
    mutationFn: async ({ dir, id }: { dir: "up" | "down"; id: string }) => {
      const { reorderLeaguesSwap } = await import("@/lib/league-order");
      await reorderLeaguesSwap(leagues ?? [], id, dir);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leagues-admin"] });
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const create = async (e: React.FormEvent, publish: boolean) => {
    e.preventDefault();
    const err = validateConfigs(configs);
    if (err) return toast.error(err);
    setSubmitting(true);
    let bannerPath: string | null = null;
    try {
      if (bannerFile) bannerPath = await uploadLeagueBanner(bannerFile);
    } catch (err: any) {
      setSubmitting(false);
      return toast.error(err.message);
    }
    const first = configs[0];
    const { error } = await supabase.from("leagues").insert({
      name: name.trim(),
      description: desc.trim() || null,
      car_class: first.car_class,
      driver_category: first.driver_category,
      class_configs: configs as any,
      is_offseason: isOffseason,
      approved_only: approvedOnly,
      briefing_required: briefingRequired,
      separate_division_standings: separateDivisionStandings,
      protest_tickets_per_season: Math.max(0, Math.floor(protestTickets || 0)),
      banner_url: bannerPath,
      event_settings: eventSettings as any,
      points_system: pointsSystem as any,
      signup_opens_at: signupOpensAt ? new Date(signupOpensAt).toISOString() : null,
      published: publish,
      created_by: user?.id,
      car_lock_never: carLockNever,
      car_lock_at: carLockNever ? null : (carLockAt ? new Date(carLockAt).toISOString() : null),
    } as any);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(publish ? (isOffseason ? "Off-season event publiceret" : "Liga publiceret") : "Gemt i arkivet");
    setCreatedLeague(true);
    setOpen(false);
    setName("");
    setDesc("");
    setIsOffseason(false);
    setApprovedOnly(false);
    setBriefingRequired(true);
    setSeparateDivisionStandings(false);
    setProtestTickets(3);
    setConfigs([emptyConfig()]);
    setBannerFile(null);
    setEventSettings({});
    setPointsSystem({});
    setSignupOpensAt("");
    setCarLockNever(false);
    setCarLockAt("");
    qc.invalidateQueries({ queryKey: ["leagues-admin"] });
    qc.invalidateQueries({ queryKey: ["leagues"] });
  };


  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leagues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slettet"); qc.invalidateQueries({ queryKey: ["leagues-admin"] }); qc.invalidateQueries({ queryKey: ["leagues"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { error } = await supabase.from("leagues").update({ published: publish } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.publish ? "Liga publiceret" : "Liga arkiveret");
      qc.invalidateQueries({ queryKey: ["leagues-admin"] });
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isLeagueList) return <Outlet />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{showArchive ? "Ligaer (arkiv)" : "Ligaer"}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-1"><Link to="/admin"><ArrowLeft className="h-4 w-4" /> Kontrolpanel</Link></Button>
          <Button variant="outline" className="gap-1" onClick={() => setShowArchive((v) => !v)}>
            {showArchive ? (<><ArchiveRestore className="h-4 w-4" /> Aktive ligaer</>) : (<><Archive className="h-4 w-4" /> Arkiv</>)}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Ny liga</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Opret liga eller off-season event</DialogTitle></DialogHeader>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
                <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label>Beskrivelse</Label><Textarea rows={8} className="min-h-[200px]" placeholder="Brug tomme linjer for at adskille afsnit." maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
                <BannerPicker pathOrUrl={null} file={bannerFile} onFile={setBannerFile} onClear={() => setBannerFile(null)} />
                <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                  <Checkbox checked={isOffseason} onCheckedChange={(v) => setIsOffseason(v === true)} />
                  <span className="text-sm">Off-season event (enkeltløb, vises i separat sektion)</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                  <Checkbox checked={approvedOnly} onCheckedChange={(v) => setApprovedOnly(v === true)} />
                  <span className="text-sm">Kun godkendte profiler kan tilmelde sig</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                  <Checkbox checked={briefingRequired} onCheckedChange={(v) => setBriefingRequired(v === true)} />
                  <span className="text-sm">Drivers Briefing er obligatorisk (knap vises på afdelinger)</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                  <Checkbox checked={separateDivisionStandings} onCheckedChange={(v) => setSeparateDivisionStandings(v === true)} />
                  <span className="text-sm">Hver afdeling er sin egen serie (stillinger vises pr. afdeling og klasse, ingen samlet liga-stilling)</span>
                </label>
                <div className="space-y-1 rounded-md border border-border p-2">
                  <Label>Protest-billetter pr. deltager</Label>
                  <Input type="number" min={0} max={50} value={protestTickets} onChange={(e) => setProtestTickets(Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">Antal protester en deltager har til rådighed i hele sæsonen. Får man medhold, koster det ingen billet — ellers koster en protest 1 billet.</p>
                </div>
                <ClassConfigsEditor configs={configs} setConfigs={setConfigs} />

                <div className="space-y-1 rounded-md border border-border p-2">
                  <Label>Tilmelding åbner</Label>
                  <Input type="datetime-local" value={signupOpensAt} onChange={(e) => setSignupOpensAt(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Lad være tom for at holde tilmelding lukket. En nedtælling vises på ligasiden indtil tidspunktet.</p>
                </div>
                <CarLockEditor
                  never={carLockNever}
                  at={carLockAt}
                  onNever={setCarLockNever}
                  onAt={setCarLockAt}
                />
                <BriefingOpenEditor value={eventSettings} onChange={setEventSettings} />
                <DriverAidsEditor value={eventSettings} onChange={setEventSettings} />
                <PointsSystemEditor value={pointsSystem} onChange={setPointsSystem} />
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button type="button" variant="secondary" disabled={submitting} onClick={(e) => create(e as any, false)} className="gap-1">
                    <Archive className="h-4 w-4" /> {submitting ? "Gemmer…" : "Arkiver"}
                  </Button>
                  <Button type="button" disabled={submitting} onClick={(e) => create(e as any, true)} className="gap-1">
                    <Send className="h-4 w-4" /> {submitting ? "Publicerer…" : "Publicer"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {createdLeague && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-sm">
          <span>Ligaen er gemt.</span>
          <Button asChild size="sm" variant="outline"><Link to="/admin">Returner til Kontrolpanel</Link></Button>
        </div>
      )}

      <div className="space-y-3">
        {leagues?.length === 0 && <p className="text-muted-foreground">{showArchive ? "Arkivet er tomt." : "Ingen ligaer endnu."}</p>}
        {leagues?.map((l: any, idx: number) => {
          const cfgs: ClassConfig[] = Array.isArray(l.class_configs) ? l.class_configs : [];
          const canMoveUp = idx > 0;
          const canMoveDown = idx < (leagues.length - 1);
          const handleMove = (dir: "up" | "down") => {
            if (!leagues) return;
            reorder.mutate({ id: l.id, dir });
          };
          return (
          <Card key={l.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {l.name}
                      {l.is_offseason && <Badge variant="secondary" className="text-[10px]">Off-season</Badge>}
                      {!l.published && <Badge variant="outline" className="text-[10px]">Kladde</Badge>}
                    </CardTitle>
                    {l.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{l.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {cfgs.length > 0
                        ? cfgs.map((c, i) => (
                            <Badge key={i} variant="outline">
                              {c.car_class} {c.driver_category} · #{c.number_from}-{c.number_to}
                              {c.max_drivers ? ` · maks ${c.max_drivers}` : ""}
                              {c.dns_limit ? ` · DNS ${c.dns_limit}` : ""}
                            </Badge>
                          ))
                        : (<>
                            {l.car_class && <Badge>{l.car_class}</Badge>}
                            {l.driver_category && <Badge variant="secondary">{l.driver_category}</Badge>}
                          </>)}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={!canMoveUp || reorder.isPending}
                      onClick={() => handleMove("up")}
                      title="Flyt op"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={!canMoveDown || reorder.isPending}
                      onClick={() => handleMove("down")}
                      title="Flyt ned"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    <EditLeagueDialog league={l} />
                    {l.published ? (
                      <Button variant="ghost" size="sm" title="Arkiver" onClick={() => { if (confirm("Arkiver liga? Den vil ikke længere være synlig for offentligheden.")) togglePublish.mutate({ id: l.id, publish: false }); }}>
                        <Archive className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" title="Publicer" onClick={() => togglePublish.mutate({ id: l.id, publish: true })}>
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Slet liga?")) del.mutate(l.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1"><Link to="/admin/ligaer/$leagueId/afdelinger" params={{ leagueId: l.id }}><Settings className="h-4 w-4" /> Afdelinger</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/admin/ligaer/$leagueId/stillinger" params={{ leagueId: l.id }}>Stillinger</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/admin/ligaer/$leagueId/regler" params={{ leagueId: l.id }}>Regler</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/admin/ligaer/$leagueId/entries" params={{ leagueId: l.id }}>Entries</Link></Button>
                {l.discord_role_id && <SyncDiscordRolesButton leagueId={l.id} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


function EditLeagueDialog({ league }: { league: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(league.name ?? "");
  const [desc, setDesc] = useState(league.description ?? "");
  const [isOffseason, setIsOffseason] = useState<boolean>(!!league.is_offseason);
  const [approvedOnly, setApprovedOnly] = useState<boolean>(!!league.approved_only);
  const [briefingRequired, setBriefingRequired] = useState<boolean>(league.briefing_required !== false);
  const [separateDivisionStandings, setSeparateDivisionStandings] = useState<boolean>(!!league.separate_division_standings);
  const [protestTickets, setProtestTickets] = useState<number>(typeof league.protest_tickets_per_season === "number" ? league.protest_tickets_per_season : 3);
  const initialCfgs: ClassConfig[] = Array.isArray(league.class_configs) && league.class_configs.length > 0 ? league.class_configs : [emptyConfig()];
  const [cfgs, setCfgs] = useState<ClassConfig[]>(initialCfgs);
  const [bannerPath, setBannerPath] = useState<string | null>(league.banner_url ?? null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [eventSettings, setEventSettings] = useState<EventSettings>(
    (league.event_settings && typeof league.event_settings === "object" ? league.event_settings : {}) as EventSettings,
  );
  const [pointsSystem, setPointsSystem] = useState<PointsSystem>(
    (league.points_system && typeof league.points_system === "object" ? league.points_system : {}) as PointsSystem,
  );
  const toLocalInput = (iso: string | null | undefined): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [signupOpensAt, setSignupOpensAt] = useState<string>(toLocalInput(league.signup_opens_at));
  const [discordRoleId, setDiscordRoleId] = useState<string>(league.discord_role_id ?? "");
  const [carLockNever, setCarLockNever] = useState<boolean>(!!league.car_lock_never);
  const [carLockAt, setCarLockAt] = useState<string>(toLocalInput(league.car_lock_at));
  const [saving, setSaving] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const announceFn = useServerFn(sendLeagueAnnouncement);

  const announce = async () => {
    setAnnouncing(true);
    try {
      const res = await announceFn({ data: { leagueId: league.id } });
      toast.success(
        res.kind === "countdown"
          ? "Annoncering med nedtælling sendt til Discord."
          : "Annoncering om åben tilmelding sendt til Discord.",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke sende annoncering.");
    } finally {
      setAnnouncing(false);
    }
  };


  const reset = () => {
    setName(league.name ?? "");
    setDesc(league.description ?? "");
    setIsOffseason(!!league.is_offseason);
    setApprovedOnly(!!league.approved_only);
    setBriefingRequired(league.briefing_required !== false);
    setSeparateDivisionStandings(!!league.separate_division_standings);
    setProtestTickets(typeof league.protest_tickets_per_season === "number" ? league.protest_tickets_per_season : 3);
    setCfgs(Array.isArray(league.class_configs) && league.class_configs.length > 0 ? league.class_configs : [emptyConfig()]);
    setBannerPath(league.banner_url ?? null);
    setBannerFile(null);
    setEventSettings((league.event_settings && typeof league.event_settings === "object" ? league.event_settings : {}) as EventSettings);
    setPointsSystem((league.points_system && typeof league.points_system === "object" ? league.points_system : {}) as PointsSystem);
    setSignupOpensAt(toLocalInput(league.signup_opens_at));
    setDiscordRoleId(league.discord_role_id ?? "");
    setCarLockNever(!!league.car_lock_never);
    setCarLockAt(toLocalInput(league.car_lock_at));
  };

  const submit = async (e: React.FormEvent | React.MouseEvent, publish: boolean) => {
    e.preventDefault();
    const err = validateConfigs(cfgs);
    if (err) return toast.error(err);
    setSaving(true);
    let newBanner = bannerPath;
    try {
      if (bannerFile) newBanner = await uploadLeagueBanner(bannerFile);
    } catch (err: any) {
      setSaving(false);
      return toast.error(err.message);
    }
    const first = cfgs[0];
    const { error } = await supabase
      .from("leagues")
      .update({
        name: name.trim(),
        description: desc.trim() || null,
        car_class: first.car_class,
        driver_category: first.driver_category,
        class_configs: cfgs as any,
        is_offseason: isOffseason,
        approved_only: approvedOnly,
        briefing_required: briefingRequired,
        separate_division_standings: separateDivisionStandings,
        protest_tickets_per_season: Math.max(0, Math.floor(protestTickets || 0)),
        banner_url: newBanner,
        event_settings: eventSettings as any,
        points_system: pointsSystem as any,
        signup_opens_at: signupOpensAt ? new Date(signupOpensAt).toISOString() : null,
        discord_role_id: discordRoleId.trim() || null,
        car_lock_never: carLockNever,
        car_lock_at: carLockNever ? null : (carLockAt ? new Date(carLockAt).toISOString() : null),
        published: publish,
      } as any)
      .eq("id", league.id);

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(publish ? (league.published ? "Liga opdateret" : "Liga publiceret") : "Gemt i arkivet");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["leagues-admin"] });
    qc.invalidateQueries({ queryKey: ["leagues"] });
    qc.invalidateQueries({ queryKey: ["leagues-entries-counts"] });
    qc.invalidateQueries({ queryKey: ["league", league.id] });
    qc.invalidateQueries({ queryKey: ["league-admin", league.id] });
    qc.invalidateQueries({ queryKey: ["divisions", league.id] });
  };


  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2">Rediger liga {!league.published && <Badge variant="outline" className="text-[10px]">Kladde</Badge>}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
          <div><Label>Navn</Label><Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Beskrivelse</Label><Textarea rows={8} className="min-h-[200px]" placeholder="Brug tomme linjer for at adskille afsnit." maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <BannerPicker pathOrUrl={bannerPath} file={bannerFile} onFile={setBannerFile} onClear={() => setBannerPath(null)} />
          <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
            <Checkbox checked={isOffseason} onCheckedChange={(v) => setIsOffseason(v === true)} />
            <span className="text-sm">Off-season event</span>
          </label>
          <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
            <Checkbox checked={approvedOnly} onCheckedChange={(v) => setApprovedOnly(v === true)} />
            <span className="text-sm">Kun godkendte profiler kan tilmelde sig</span>
          </label>
          <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
            <Checkbox checked={briefingRequired} onCheckedChange={(v) => setBriefingRequired(v === true)} />
            <span className="text-sm">Drivers Briefing er obligatorisk (knap vises på afdelinger)</span>
          </label>
          <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
            <Checkbox checked={separateDivisionStandings} onCheckedChange={(v) => setSeparateDivisionStandings(v === true)} />
            <span className="text-sm">Hver afdeling er sin egen serie (stillinger vises pr. afdeling og klasse, ingen samlet liga-stilling)</span>
          </label>
          <div className="space-y-1 rounded-md border border-border p-2">
            <Label>Protest-billetter pr. deltager</Label>
            <Input type="number" min={0} max={50} value={protestTickets} onChange={(e) => setProtestTickets(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Antal protester en deltager har til rådighed i hele sæsonen. Får man medhold, koster det ingen billet — ellers koster en protest 1 billet.</p>
          </div>
          <ClassConfigsEditor configs={cfgs} setConfigs={setCfgs} />

          <div className="space-y-1 rounded-md border border-border p-2">
            <Label>Tilmelding åbner</Label>
            <Input type="datetime-local" value={signupOpensAt} onChange={(e) => setSignupOpensAt(e.target.value)} />
            <p className="text-xs text-muted-foreground">Lad være tom for at holde tilmelding lukket. En nedtælling vises på ligasiden indtil tidspunktet.</p>
          </div>
          <div className="space-y-1 rounded-md border border-border p-2">
            <Label>Discord rolle-ID</Label>
            <Input
              value={discordRoleId}
              onChange={(e) => setDiscordRoleId(e.target.value)}
              placeholder="fx 1234567890123456789"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              Når en kører tilmelder sig denne liga, får de automatisk denne rolle på Discord (hvis de har forbundet deres Discord-konto). Find rolle-ID'et i Discord ved at højreklikke på rollen i Server Settings → Roles (Developer Mode skal være slået til).
            </p>
          </div>
          <CarLockEditor
            never={carLockNever}
            at={carLockAt}
            onNever={setCarLockNever}
            onAt={setCarLockAt}
          />
          <BriefingOpenEditor value={eventSettings} onChange={setEventSettings} />
          <DriverAidsEditor value={eventSettings} onChange={setEventSettings} />
          <PointsSystemEditor value={pointsSystem} onChange={setPointsSystem} />
          <div className="rounded-md border border-border p-2 space-y-2">
            <div className="flex items-start gap-2">
              <Megaphone className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="text-xs text-muted-foreground">
                Send en Discord-annoncering nu. Hvis tilmeldingen endnu ikke er åben, sendes et hype-opslag med live-nedtælling. Er tilmeldingen allerede åben, sendes den samme besked som ved auto-åbning.
              </div>
            </div>
            <Button type="button" variant="outline" disabled={announcing} onClick={announce} className="gap-1">
              <Megaphone className="h-4 w-4" /> {announcing ? "Sender…" : "Send annoncering"}
            </Button>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="secondary" disabled={saving} onClick={(e) => submit(e, false)} className="gap-1">
              <Archive className="h-4 w-4" /> {saving ? "Gemmer…" : "Arkiver"}
            </Button>
            <Button type="button" disabled={saving} onClick={(e) => submit(e, true)} className="gap-1">
              <Send className="h-4 w-4" /> {saving ? "Gemmer…" : "Publicer"}
            </Button>
          </DialogFooter>

        </form>
      </DialogContent>
    </Dialog>
  );
}

function SyncDiscordRolesButton({ leagueId }: { leagueId: string }) {
  const syncFn = useServerFn(syncDiscordRolesForLeague);
  const [pending, setPending] = useState(false);
  const onClick = async () => {
    if (!confirm("Synkronisér Discord-rollen, så kun folk på entry-listen har den?")) return;
    setPending(true);
    try {
      const res = await syncFn({ data: { leagueId } });
      if (!res.ok) {
        toast.error(res.reason === "no_role" ? "Ligaen har ingen Discord-rolle." : "Sync mislykkedes.");
        return;
      }
      toast.success(
        `Sync færdig: tilføjet ${res.added}, fjernet ${res.removed} (mål ${res.targets}, havde ${res.hadRole}).`,
      );
      if (res.errors && res.errors.length > 0) {
        console.warn("Discord sync-fejl:", res.errors);
        toast.message(`${res.errors.length} kald fejlede – se konsol.`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Sync fejlede.");
    } finally {
      setPending(false);
    }
  };
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={onClick}>
      {pending ? "Synkroniserer…" : "Synk Discord-rolle"}
    </Button>
  );
}

