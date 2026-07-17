import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Link as LinkIcon,
  Megaphone,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  CAR_CLASSES,
  DRIVER_CATEGORIES,
  EVENT_AID_FIELDS,
  ON_OFF_OPTIONS,
  type ClassConfig,
  type EventSettings,
  type OnOff,
} from "@/lib/tracks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PointsSystemEditor, type PointsSystem } from "@/components/PointsSystemEditor";
import { sendLeagueAnnouncement, previewLeagueAnnouncement } from "@/lib/league-announce.functions";
import { buildLeagueAnnouncementEmail } from "@/lib/league-announce-email.functions";
import { rebalanceLeagueWaitlist } from "@/lib/league-admin-entries.functions";
import { sendTransactionalEmail } from "@/lib/email/send";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------- helpers ----------

async function uploadLeagueBanner(file: File): Promise<string> {
  if (file.size > 8 * 1024 * 1024) throw new Error("Billedet må højst være 8 MB.");
  if (!file.type.startsWith("image/")) throw new Error("Vælg en billedfil.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `banner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("league-banners")
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}

function emptyConfig(): ClassConfig {
  return {
    car_class: CAR_CLASSES[0],
    driver_category: DRIVER_CATEGORIES[0],
    number_from: 1,
    number_to: 50,
    max_drivers: 20,
    dns_limit: 2,
  };
}

function validateConfigs(configs: ClassConfig[]): string | null {
  if (configs.length === 0) return "Tilføj mindst én bilklasse.";
  for (const c of configs) {
    if (!c.car_class || !c.driver_category) return "Udfyld klasse og kategori.";
    if (
      !Number.isInteger(c.number_from) ||
      !Number.isInteger(c.number_to) ||
      c.number_from < 1 ||
      c.number_to < c.number_from
    )
      return "Ugyldigt nummerinterval.";
  }
  return null;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- sub-editors ----------

function BannerPicker({
  pathOrUrl,
  file,
  onFile,
  onClear,
}: {
  pathOrUrl: string | null;
  file: File | null;
  onFile: (f: File | null) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { data: previewUrl } = useQuery({
    queryKey: ["banner-preview", pathOrUrl],
    enabled: !!pathOrUrl && !pathOrUrl.startsWith("http"),
    queryFn: async () => {
      const { data } = await supabase.storage
        .from("league-banners")
        .createSignedUrl(pathOrUrl!, 60 * 60);
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => ref.current?.click()}
        >
          <ImagePlus className="h-3 w-3" /> Vælg billede
        </Button>
        {(file || pathOrUrl) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onFile(null);
              onClear();
              if (ref.current) ref.current.value = "";
            }}
          >
            Fjern
          </Button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          onFile(f);
        }}
      />
    </div>
  );
}

function ClassConfigsEditor({
  configs,
  setConfigs,
}: {
  configs: ClassConfig[];
  setConfigs: (cb: (prev: ClassConfig[]) => ClassConfig[]) => void;
}) {
  const update = (i: number, patch: Partial<ClassConfig>) =>
    setConfigs((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => setConfigs((prev) => prev.filter((_, idx) => idx !== i));
  const sharedDns = configs.find((c) => c.dns_limit != null)?.dns_limit;
  const setSharedDns = (v: number | undefined) =>
    setConfigs((prev) => prev.map((c) => ({ ...c, dns_limit: v })));
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border p-2">
        <Label className="text-xs">DNS-grænse (fælles for alle klasser)</Label>
        <Input
          type="number"
          min={1}
          value={sharedDns ?? ""}
          placeholder="Ingen"
          onChange={(e) =>
            setSharedDns(e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
      </div>
      {configs.map((c, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Klasse {i + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(i)}
              disabled={configs.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Klasse</Label>
              <Select value={c.car_class} onValueChange={(v) => update(i, { car_class: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAR_CLASSES.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Kategori</Label>
              <Select
                value={c.driver_category}
                onValueChange={(v) => update(i, { driver_category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DRIVER_CATEGORIES.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fra nr.</Label>
              <Input
                type="number"
                min={1}
                value={c.number_from}
                onChange={(e) => update(i, { number_from: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Til nr.</Label>
              <Input
                type="number"
                min={1}
                value={c.number_to}
                onChange={(e) => update(i, { number_to: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Maks. deltagere</Label>
              <Input
                type="number"
                min={1}
                value={c.max_drivers ?? ""}
                placeholder="Ubegrænset"
                onChange={(e) =>
                  update(i, {
                    max_drivers: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1"
        onClick={() =>
          setConfigs((p) => [...p, { ...emptyConfig(), dns_limit: sharedDns }])
        }
      >
        <Plus className="h-3 w-3" /> Tilføj klasse
      </Button>
    </div>
  );
}

function DriverAidsEditor({
  value,
  onChange,
}: {
  value: EventSettings;
  onChange: (next: EventSettings) => void;
}) {
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
              onValueChange={(v) =>
                patch({ [f.key]: (v || undefined) as OnOff | undefined } as Partial<EventSettings>)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="–" />
              </SelectTrigger>
              <SelectContent>
                {ON_OFF_OPTIONS.map((x) => (
                  <SelectItem key={x} value={x}>
                    {x}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

function BriefingOpenEditor({
  value,
  onChange,
  disabled,
}: {
  value: EventSettings;
  onChange: (next: EventSettings) => void;
  disabled?: boolean;
}) {
  const current = value.briefing_open_minutes_before ?? 30;
  return (
    <div className="space-y-1 rounded-md border border-border p-2">
      <Label>Drivers Briefing åbner (min før løbsstart)</Label>
      <Input
        type="number"
        min={0}
        max={1440}
        value={current}
        disabled={disabled}
        onChange={(e) =>
          onChange({ ...value, briefing_open_minutes_before: Number(e.target.value) })
        }
      />
      <p className="text-xs text-muted-foreground">
        {disabled
          ? 'Aktivér "Drivers Briefing er obligatorisk" for at redigere.'
          : "Nedtælling vises på knappen indtil kanalen åbner. Admins har altid adgang."}
      </p>
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
          Vælg dato og tid. Når tidspunktet er nået, kan deltagerne ikke længere ændre bil. Lad
          være tom for at undlade at låse.
        </p>
      </div>
    </div>
  );
}

// ---------- main wizard ----------

type Mode = "create" | "edit";

export function LeagueFormWizard({
  open,
  onOpenChange,
  mode,
  league,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  league?: any;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const rebalanceWaitlistFn = useServerFn(rebalanceLeagueWaitlist);

  // ---- state ----
  const initial = league ?? {};
  const initialCfgs: ClassConfig[] =
    Array.isArray(initial.class_configs) && initial.class_configs.length > 0
      ? initial.class_configs
      : [emptyConfig()];

  const [step, setStep] = useState(0);
  const [name, setName] = useState<string>(initial.name ?? "");
  const [desc, setDesc] = useState<string>(initial.description ?? "");
  const [isOffseason, setIsOffseason] = useState<boolean>(!!initial.is_offseason);
  const [bannerPath, setBannerPath] = useState<string | null>(initial.banner_url ?? null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const [signupOpensAt, setSignupOpensAt] = useState<string>(toLocalInput(initial.signup_opens_at));
  const [approvedOnly, setApprovedOnly] = useState<boolean>(!!initial.approved_only);
  const [teamsAllowed, setTeamsAllowed] = useState<boolean>(!!initial.teams_allowed);
  const [discordRoleId, setDiscordRoleId] = useState<string>(initial.discord_role_id ?? "");
  const [incidentChannelId, setIncidentChannelId] = useState<string>((initial as any).incident_channel_id ?? "");

  const [cfgs, setCfgs] = useState<ClassConfig[]>(initialCfgs);

  const [briefingRequired, setBriefingRequired] = useState<boolean>(
    initial.briefing_required !== false,
  );
  const [eventSettings, setEventSettings] = useState<EventSettings>(
    (initial.event_settings && typeof initial.event_settings === "object"
      ? initial.event_settings
      : {}) as EventSettings,
  );
  const [carLockNever, setCarLockNever] = useState<boolean>(!!initial.car_lock_never);
  const [carLockAt, setCarLockAt] = useState<string>(toLocalInput(initial.car_lock_at));

  const [separateDivisionStandings, setSeparateDivisionStandings] = useState<boolean>(
    !!initial.separate_division_standings,
  );
  const [protestTickets, setProtestTickets] = useState<number>(
    typeof initial.protest_tickets_per_season === "number"
      ? initial.protest_tickets_per_season
      : 3,
  );
  const [pointsSystem, setPointsSystem] = useState<PointsSystem>(
    (initial.points_system && typeof initial.points_system === "object"
      ? initial.points_system
      : {}) as PointsSystem,
  );

  const [submitting, setSubmitting] = useState(false);

  // ---- step definitions ----
  const cfgError = useMemo(() => validateConfigs(cfgs), [cfgs]);
  const sections = [
    {
      title: "Grundinfo",
      desc: "Navn, beskrivelse og banner",
      complete: name.trim().length > 0,
    },
    {
      title: "Tilmelding",
      desc: "Hvem og hvornår",
      complete: true,
    },
    {
      title: "Bilklasser",
      desc: "Klasser og kørenumre",
      complete: cfgError == null,
    },
    {
      title: "Race-indstillinger",
      desc: "Briefing, bil-lås og driver aids",
      complete: true,
    },
    {
      title: "Point & protester",
      desc: "Stillinger, protester og pointsystem",
      complete: true,
    },
  ];
  const last = sections.length - 1;

  // ---- submit ----
  const handleSubmit = async (publish: boolean) => {
    const err = validateConfigs(cfgs);
    if (err) {
      setStep(2);
      return toast.error(err);
    }
    if (!name.trim()) {
      setStep(0);
      return toast.error("Indtast et navn.");
    }
    setSubmitting(true);
    let newBanner = bannerPath;
    try {
      if (bannerFile) newBanner = await uploadLeagueBanner(bannerFile);
    } catch (e: any) {
      setSubmitting(false);
      return toast.error(e.message);
    }
    const first = cfgs[0];
    const payload: any = {
      name: name.trim(),
      description: desc.trim() || null,
      car_class: first.car_class,
      driver_category: first.driver_category,
      class_configs: cfgs as any,
      is_offseason: isOffseason,
      approved_only: approvedOnly,
      teams_allowed: teamsAllowed,
      briefing_required: briefingRequired,
      separate_division_standings: separateDivisionStandings,
      protest_tickets_per_season: Math.max(0, Math.floor(protestTickets || 0)),
      banner_url: newBanner,
      event_settings: eventSettings as any,
      points_system: pointsSystem as any,
      signup_opens_at: signupOpensAt ? new Date(signupOpensAt).toISOString() : null,
      discord_role_id: discordRoleId.trim() || null,
      incident_channel_id: incidentChannelId.trim() || null,
      car_lock_never: carLockNever,
      car_lock_at: carLockNever ? null : carLockAt ? new Date(carLockAt).toISOString() : null,
      published: publish,
    };

    if (mode === "create") {
      const { data: inserted, error } = await supabase
        .from("leagues")
        .insert({ ...payload, created_by: user?.id })
        .select("id")
        .single();
      if (error) {
        setSubmitting(false);
        return toast.error(error.message);
      }
      try {
        const leagueId = (inserted as { id: string }).id;
        const leagueUrl = `https://www.lmudanmark.dk/ligaer/${leagueId}`;
        const shortKey = leagueId.replace(/-/g, "").slice(0, 16);
        const safeName = name.trim();
        await supabase.from("message_templates").insert([
          {
            key: `league_${shortKey}_discord`,
            title: `🏁 Ny liga: ${safeName}`,
            kind: "discord",
            is_system: false,
            body:
              `Vi har netop åbnet en ny liga: **${safeName}**! 🏎️💨\n\n` +
              `Læs alt om klasser, kalender og tilmelding her:\n${leagueUrl}\n\n` +
              `Husk: Du skal være medlem af vores Discord for at deltage — {discord_invite}`,
          },
          {
            key: `league_${shortKey}_email`,
            title: `Ny liga på LMU Danmark: ${safeName}`,
            kind: "email",
            is_system: false,
            body:
              `Hej!\n\n` +
              `Vi har netop åbnet en ny liga: ${safeName}.\n\n` +
              `Se klasser, kalender og tilmeld dig her:\n${leagueUrl}\n\n` +
              `Vi ses på banen!\n\n— LMU Danmark`,
          },
        ] as any);
      } catch (e) {
        console.error("Kunne ikke oprette besked-skabeloner for liga", e);
      }
    } else {
      const { error } = await supabase
        .from("leagues")
        .update(payload)
        .eq("id", initial.id);
      if (error) {
        setSubmitting(false);
        return toast.error(error.message);
      }
      // Re-balance the waitlist against the (possibly new) class capacities
      try {
        await rebalanceWaitlistFn({ data: { leagueId: initial.id } });
      } catch (_) { /* non-fatal */ }
    }

    setSubmitting(false);
    toast.success(
      publish
        ? mode === "edit" && initial.published
          ? "Liga opdateret"
          : isOffseason
            ? "Off-season event publiceret"
            : "Liga publiceret"
        : "Gemt i arkivet",
    );
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["leagues-admin"] });
    qc.invalidateQueries({ queryKey: ["leagues"] });
    qc.invalidateQueries({ queryKey: ["leagues-entries-counts"] });
    if (initial.id) {
      qc.invalidateQueries({ queryKey: ["league", initial.id] });
      qc.invalidateQueries({ queryKey: ["league-admin", initial.id] });
      qc.invalidateQueries({ queryKey: ["divisions", initial.id] });
    }
    onSaved?.();
  };

  // ---- render ----
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? "Opret liga eller off-season event" : "Rediger liga"}
            {mode === "edit" && !initial.published && (
              <Badge variant="outline" className="text-[10px]">
                Kladde
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <ol className="space-y-1.5">
          {sections.map((s, i) => {
            const isActive = i === step;
            const isDone = s.complete && i !== step;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      isDone
                        ? "border-primary bg-primary text-primary-foreground"
                        : isActive
                          ? "border-primary text-primary"
                          : "border-muted-foreground/30 text-muted-foreground",
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-tight">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">{s.desc}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="pt-2">
          {/* Step bodies */}
          {step === 0 && (
            <div className="space-y-3">
              <div>
                <Label>Navn</Label>
                <Input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Beskrivelse</Label>
                <Textarea
                  rows={8}
                  className="min-h-[180px]"
                  placeholder="Brug tomme linjer for at adskille afsnit."
                  maxLength={1000}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
              <BannerPicker
                pathOrUrl={bannerPath}
                file={bannerFile}
                onFile={setBannerFile}
                onClear={() => setBannerPath(null)}
              />
              <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                <Checkbox
                  checked={isOffseason}
                  onCheckedChange={(v) => setIsOffseason(v === true)}
                />
                <span className="text-sm">
                  Off-season event (enkeltløb, vises i separat sektion)
                </span>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1 rounded-md border border-border p-2">
                <Label>Tilmelding åbner</Label>
                <Input
                  type="datetime-local"
                  value={signupOpensAt}
                  onChange={(e) => setSignupOpensAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Lad være tom for at holde tilmelding lukket. En nedtælling vises på ligasiden
                  indtil tidspunktet.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                <Checkbox
                  checked={approvedOnly}
                  onCheckedChange={(v) => setApprovedOnly(v === true)}
                />
                <span className="text-sm">Kun godkendte profiler kan tilmelde sig</span>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer">
                <Checkbox
                  checked={teamsAllowed}
                  onCheckedChange={(v) => setTeamsAllowed(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Users className="h-3.5 w-3.5" /> Teams kan tilmelde sig
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Team-ejere kan registrere deres team i ligaen og vælge et lineup. Team-listen
                    vises på ligasiden.
                  </span>
                </span>
              </label>
              <div className="space-y-1 rounded-md border border-border p-2">
                <Label>Discord rolle-ID</Label>
                <Input
                  value={discordRoleId}
                  onChange={(e) => setDiscordRoleId(e.target.value)}
                  placeholder="fx 1234567890123456789"
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  Når en kører tilmelder sig denne liga, får de automatisk denne rolle på
                  Discord (hvis de har forbundet deres Discord-konto).
                </p>
              </div>
              <div className="space-y-1 rounded-md border border-border p-2">
                <Label>Discord incident-kanal-ID</Label>
                <Input
                  value={incidentChannelId}
                  onChange={(e) => setIncidentChannelId(e.target.value)}
                  placeholder="fx 1234567890123456789"
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  Afgørelser på protester i denne liga sendes til denne Discord-kanal.
                  Hvis feltet er tomt, bruges den fælles protest-kanal.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <ClassConfigsEditor configs={cfgs} setConfigs={setCfgs} />
              {cfgError && (
                <p className="text-xs text-destructive">{cfgError}</p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                <Checkbox
                  checked={briefingRequired}
                  onCheckedChange={(v) => setBriefingRequired(v === true)}
                />
                <span className="text-sm">
                  Drivers Briefing er obligatorisk (knap vises på afdelinger)
                </span>
              </label>
              <BriefingOpenEditor
                value={eventSettings}
                onChange={setEventSettings}
                disabled={!briefingRequired}
              />
              <CarLockEditor
                never={carLockNever}
                at={carLockAt}
                onNever={setCarLockNever}
                onAt={setCarLockAt}
              />
              <DriverAidsEditor value={eventSettings} onChange={setEventSettings} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                <Checkbox
                  checked={separateDivisionStandings}
                  onCheckedChange={(v) => setSeparateDivisionStandings(v === true)}
                />
                <span className="text-sm">
                  Hver afdeling er sin egen serie (stillinger vises pr. afdeling og klasse, ingen
                  samlet liga-stilling)
                </span>
              </label>
              <div className="space-y-1 rounded-md border border-border p-2">
                <Label>Protest-billetter pr. deltager</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={protestTickets}
                  onChange={(e) => setProtestTickets(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Antal protester en deltager har til rådighed i hele sæsonen.
                </p>
              </div>
              <PointsSystemEditor value={pointsSystem} onChange={setPointsSystem} />
              {mode === "edit" && (
                <AnnouncementBlock leagueId={initial.id} />
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="gap-1"
            >
              <ArrowLeft className="h-4 w-4" /> Tilbage
            </Button>
            {step < last && (
              <Button
                type="button"
                size="sm"
                onClick={() => setStep((s) => Math.min(last, s + 1))}
                className="gap-1"
              >
                Næste <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
          {step === last && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={submitting}
                onClick={() => handleSubmit(false)}
                className="gap-1"
              >
                <Archive className="h-4 w-4" /> {submitting ? "Gemmer…" : "Arkiver"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={submitting}
                onClick={() => handleSubmit(true)}
                className="gap-1"
              >
                <Send className="h-4 w-4" /> {submitting ? "Gemmer…" : "Publicer"}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnnouncementBlock({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const announceFn = useServerFn(sendLeagueAnnouncement);
  const previewFn = useServerFn(previewLeagueAnnouncement);
  const buildEmailFn = useServerFn(buildLeagueAnnouncementEmail);
  const [discordEdit, setDiscordEdit] = useState<{ open: boolean; text: string; loading: boolean }>(
    { open: false, text: "", loading: false },
  );
  const [fbEdit, setFbEdit] = useState<{ open: boolean; text: string; loading: boolean }>({
    open: false,
    text: "",
    loading: false,
  });
  const [announcing, setAnnouncing] = useState(false);
  const [emailing, setEmailing] = useState(false);

  // Kept here for future inline edit; for now we surface Besked Hub link.
  void previewFn;
  void announceFn;
  void buildEmailFn;
  void discordEdit;
  void setDiscordEdit;
  void fbEdit;
  void setFbEdit;
  void announcing;
  void setAnnouncing;
  void emailing;
  void setEmailing;
  void sendTransactionalEmail;
  void user;

  return (
    <div className="rounded-md border border-border p-2 space-y-2">
      <div className="flex items-start gap-2">
        <Megaphone className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div className="text-xs text-muted-foreground">
          Annonceringer sendes ikke længere automatisk. Når ligaen er publiceret, ligger der både
          en Discord- og en e-mail-skabelon klar i Besked Hub som du kan redigere og selv sende ud.
        </div>
      </div>
      <Button type="button" variant="outline" asChild className="gap-1">
        <Link to="/admin/beskeder">
          <LinkIcon className="h-4 w-4" /> Åbn Besked Hub
        </Link>
      </Button>
      <input type="hidden" data-league-id={leagueId} />
    </div>
  );
}
