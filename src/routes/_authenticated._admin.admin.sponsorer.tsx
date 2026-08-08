import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Megaphone, Trash2, Loader2, Pencil, EyeOff, Eye, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/_admin/admin/sponsorer")({
  component: SponsorerAdmin,
});

type Sponsor = {
  id: string;
  name: string;
  website_url: string | null;
  logo_path: string | null;
  description: string | null;
  sort_order: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

type Settings = {
  enabled: boolean;
  rotate_seconds: number;
  position: string;
  show_on_mobile: boolean;
  show_name: boolean;
};

const BUCKET = "sponsor-images";

async function uploadLogo(file: File, userId: string | undefined): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${userId ?? "anon"}/logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return path;
}

function toLocalInput(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SponsorerAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: sponsors, isLoading } = useQuery({
    queryKey: ["admin-sponsors"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sponsors")
        .select("id,name,website_url,logo_path,description,sort_order,active,starts_at,ends_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Sponsor[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["admin-sponsor-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sponsor_settings")
        .select("enabled,rotate_seconds,position,show_on_mobile,show_name")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Settings | null;
    },
  });

  const logoPaths = (sponsors ?? []).map((s) => s.logo_path).filter((p): p is string => !!p);
  const { data: imageMap } = useQuery({
    queryKey: ["admin-sponsor-images", logoPaths.slice().sort().join(",")],
    enabled: logoPaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(logoPaths, 60 * 60 * 24);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => {
        if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      });
      return m;
    },
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["admin-sponsors"] });
    qc.invalidateQueries({ queryKey: ["admin-sponsor-images"] });
    qc.invalidateQueries({ queryKey: ["sponsors-active"] });
    qc.invalidateQueries({ queryKey: ["sponsor-settings"] });
    qc.invalidateQueries({ queryKey: ["admin-sponsor-settings"] });
  }

  const settingsMut = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const { error } = await (supabase as any).from("sponsor_settings").update(patch).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toastError(e.message ?? "Kunne ikke gemme indstillinger"),
  });

  const deleteMut = useMutation({
    mutationFn: async (s: Sponsor) => {
      if (s.logo_path) await supabase.storage.from(BUCKET).remove([s.logo_path]);
      const { error } = await (supabase as any).from("sponsors").delete().eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sponsor slettet");
      invalidateAll();
    },
    onError: (e: any) => toastError(e.message ?? "Kunne ikke slette"),
  });

  const patchMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from("sponsors").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toastError(e.message ?? "Kunne ikke opdatere"),
  });

  function move(s: Sponsor, dir: -1 | 1) {
    const list = sponsors ?? [];
    const i = list.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const other = list[j]!;
    patchMut.mutate({ id: s.id, patch: { sort_order: j } });
    patchMut.mutate({ id: other.id, patch: { sort_order: i } });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toastError("Navn mangler");
    setSubmitting(true);
    try {
      const logoPath = logoFile ? await uploadLogo(logoFile, user?.id) : null;
      const { error } = await (supabase as any).from("sponsors").insert({
        name: name.trim(),
        website_url: url.trim() || null,
        description: description.trim() || null,
        logo_path: logoPath,
        sort_order: (sponsors ?? []).length,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Sponsor oprettet");
      setName("");
      setUrl("");
      setDescription("");
      setLogoFile(null);
      invalidateAll();
    } catch (err: any) {
      toastError(err.message ?? "Kunne ikke oprette");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Sponsorer</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visning af sponsorbaren</CardTitle>
          <CardDescription>Styr hvordan sponsorbaren vises på hjemmesiden.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="sp-enabled">Vis sponsorbar</Label>
            <Switch
              id="sp-enabled"
              checked={settings?.enabled ?? false}
              onCheckedChange={(v) => settingsMut.mutate({ enabled: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="sp-mobile">Vis også på mobil</Label>
            <Switch
              id="sp-mobile"
              checked={settings?.show_on_mobile ?? false}
              onCheckedChange={(v) => settingsMut.mutate({ show_on_mobile: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="sp-showname">Vis sponsorens navn</Label>
            <Switch
              id="sp-showname"
              checked={settings?.show_name ?? true}
              onCheckedChange={(v) => settingsMut.mutate({ show_name: v })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sp-seconds">Skift sponsor efter (sekunder)</Label>
              <Input
                id="sp-seconds"
                type="number"
                min={3}
                max={120}
                defaultValue={settings?.rotate_seconds ?? 10}
                key={settings?.rotate_seconds}
                onBlur={(e) => {
                  const v = Math.min(120, Math.max(3, Number(e.target.value) || 10));
                  if (v !== settings?.rotate_seconds) settingsMut.mutate({ rotate_seconds: v });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Placering</Label>
              <Select
                value={settings?.position ?? "right"}
                onValueChange={(v) => settingsMut.mutate({ position: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="right">Højre side</SelectItem>
                  <SelectItem value="left">Venstre side</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ny sponsor</CardTitle>
          <CardDescription>Logoet vises i baren og linker til sponsorens hjemmeside.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="sp-name">Navn</Label>
              <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-url">Hjemmeside (link)</Label>
              <Input id="sp-url" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-logo">Logo</Label>
              <Input id="sp-logo" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
              {logoFile && <p className="text-xs text-muted-foreground">{logoFile.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-desc">Kort tekst (valgfri)</Label>
              <Textarea id="sp-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Opret sponsor
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Sponsorer</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Indlæser…</p>}
        {!isLoading && (sponsors ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen sponsorer endnu.</p>
        )}
        {(sponsors ?? []).map((s, idx) => (
          <Card key={s.id} className={s.active ? "" : "opacity-60"}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {s.logo_path && imageMap?.[s.logo_path] && (
                    <img src={imageMap[s.logo_path]} alt={s.name} className="h-12 w-16 rounded bg-muted object-contain" />
                  )}
                  <div className="min-w-0">
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <CardDescription className="truncate">
                      {s.active ? "Aktiv" : "Skjult"}
                      {s.website_url ? ` · ${s.website_url}` : ""}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label="Flyt op" disabled={idx === 0} onClick={() => move(s, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Flyt ned"
                    disabled={idx === (sponsors ?? []).length - 1}
                    onClick={() => move(s, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={s.active ? "Skjul" : "Vis"}
                    onClick={() => patchMut.mutate({ id: s.id, patch: { active: !s.active } })}
                  >
                    {s.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <EditSponsorDialog sponsor={s} onSaved={invalidateAll} />
                  <Button variant="ghost" size="icon" aria-label="Slet" onClick={() => deleteMut.mutate(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EditSponsorDialog({ sponsor, onSaved }: { sponsor: Sponsor; onSaved: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(sponsor.name);
  const [url, setUrl] = useState(sponsor.website_url ?? "");
  const [description, setDescription] = useState(sponsor.description ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(sponsor.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(sponsor.ends_at));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(sponsor.name);
      setUrl(sponsor.website_url ?? "");
      setDescription(sponsor.description ?? "");
      setStartsAt(toLocalInput(sponsor.starts_at));
      setEndsAt(toLocalInput(sponsor.ends_at));
      setLogoFile(null);
    }
  }, [open, sponsor]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toastError("Navn mangler");
    setSaving(true);
    try {
      let logoPath = sponsor.logo_path;
      if (logoFile) {
        if (sponsor.logo_path) await supabase.storage.from(BUCKET).remove([sponsor.logo_path]);
        logoPath = await uploadLogo(logoFile, user?.id);
      }
      const { error } = await (supabase as any)
        .from("sponsors")
        .update({
          name: name.trim(),
          website_url: url.trim() || null,
          description: description.trim() || null,
          logo_path: logoPath,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        })
        .eq("id", sponsor.id);
      if (error) throw error;
      toast.success("Sponsor opdateret");
      setOpen(false);
      onSaved();
    } catch (err: any) {
      toastError(err.message ?? "Kunne ikke gemme");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Rediger">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rediger sponsor</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSave}>
          <div className="space-y-2">
            <Label>Navn</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
          </div>
          <div className="space-y-2">
            <Label>Hjemmeside</Label>
            <Input type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Logo</Label>
            <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            {logoFile && <p className="text-xs text-muted-foreground">Nyt logo: {logoFile.name}</p>}
          </div>
          <div className="space-y-2">
            <Label>Kort tekst</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Vises fra (valgfri)</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Vises til (valgfri)</Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annullér
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gem
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
