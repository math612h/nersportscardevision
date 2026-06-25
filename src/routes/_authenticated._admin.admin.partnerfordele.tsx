import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Handshake, Trash2, Loader2, Pencil, EyeOff, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/_admin/admin/partnerfordele")({
  component: PartnerfordeleAdmin,
});

type PartnerBenefit = {
  id: string;
  name: string;
  logo_path: string | null;
  hero_image_path: string | null;
  body: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
};

const BUCKET = "partner-images";

async function uploadImage(file: File, userId: string | undefined, kind: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId ?? "anon"}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return path;
}

function PartnerfordeleAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: benefits, isLoading } = useQuery({
    queryKey: ["admin-partner-benefits"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("partner_benefits")
        .select("id,name,logo_path,hero_image_path,body,sort_order,active,created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PartnerBenefit[];
    },
  });

  const imagePaths = (benefits ?? [])
    .flatMap((b) => [b.logo_path, b.hero_image_path])
    .filter((p): p is string => !!p);
  const { data: imageMap } = useQuery({
    queryKey: ["admin-partner-images", imagePaths.sort().join(",")],
    enabled: imagePaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(imagePaths, 60 * 60 * 24);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => {
        if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      });
      return m;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (b: PartnerBenefit) => {
      const toRemove = [b.logo_path, b.hero_image_path].filter((p): p is string => !!p);
      if (toRemove.length) await supabase.storage.from(BUCKET).remove(toRemove);
      const { error } = await (supabase as any).from("partner_benefits").delete().eq("id", b.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Partneraftale slettet");
      qc.invalidateQueries({ queryKey: ["admin-partner-benefits"] });
      qc.invalidateQueries({ queryKey: ["partner-benefits"] });
    },
    onError: (e: any) => toastError(e.message ?? "Kunne ikke slette"),
  });

  const toggleActiveMut = useMutation({
    mutationFn: async (b: PartnerBenefit) => {
      const { error } = await (supabase as any)
        .from("partner_benefits")
        .update({ active: !b.active })
        .eq("id", b.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-partner-benefits"] });
      qc.invalidateQueries({ queryKey: ["partner-benefits"] });
    },
    onError: (e: any) => toastError(e.message ?? "Kunne ikke opdatere"),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toastError("Navn mangler");
    setSubmitting(true);
    try {
      const logoPath = logoFile ? await uploadImage(logoFile, user?.id, "logo") : null;
      const heroPath = heroFile ? await uploadImage(heroFile, user?.id, "hero") : null;
      const { error } = await (supabase as any).from("partner_benefits").insert({
        name: name.trim(),
        body: body.trim() || null,
        logo_path: logoPath,
        hero_image_path: heroPath,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Partneraftale oprettet");
      setName("");
      setBody("");
      setLogoFile(null);
      setHeroFile(null);
      qc.invalidateQueries({ queryKey: ["admin-partner-benefits"] });
      qc.invalidateQueries({ queryKey: ["partner-benefits"] });
    } catch (err: any) {
      toastError(err.message ?? "Kunne ikke oprette");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Handshake className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Partnerfordele</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ny aftale</CardTitle>
          <CardDescription>
            Tilføj en ny partneraftale. Logoet vises på kortet på partnerfordele-siden. Topbilledet vises i toppen, når man klikker ind på aftalen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="pb-name">Navn på partner</Label>
              <Input id="pb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pb-logo">Logo (vises på kortet)</Label>
              <Input id="pb-logo" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
              {logoFile && <p className="text-xs text-muted-foreground">{logoFile.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pb-hero">Topbillede (vises øverst på aftalen)</Label>
              <Input id="pb-hero" type="file" accept="image/*" onChange={(e) => setHeroFile(e.target.files?.[0] ?? null)} />
              {heroFile && <p className="text-xs text-muted-foreground">{heroFile.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pb-body">Beskrivelse</Label>
              <RichTextEditor value={body} onChange={setBody} placeholder="Skriv hvad partnerfordelen indebærer…" minHeight={200} />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Opret aftale
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Eksisterende aftaler</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Indlæser…</p>}
        {!isLoading && (benefits ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen aftaler endnu.</p>
        )}
        <div className="space-y-3">
          {(benefits ?? []).map((b) => (
            <Card key={b.id} className={b.active ? "" : "opacity-60"}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {b.logo_path && imageMap?.[b.logo_path] && (
                      <img src={imageMap[b.logo_path]} alt={b.name} className="h-12 w-12 rounded object-contain bg-muted" />
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-base">{b.name}</CardTitle>
                      <CardDescription>{b.active ? "Aktiv" : "Skjult"}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => toggleActiveMut.mutate(b)} aria-label={b.active ? "Skjul" : "Vis"} title={b.active ? "Skjul" : "Vis"}>
                      {b.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <EditBenefitDialog benefit={b} />
                    <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(b)} disabled={deleteMut.isPending} aria-label="Slet">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditBenefitDialog({ benefit }: { benefit: PartnerBenefit }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(benefit.name);
  const [body, setBody] = useState(benefit.body ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeHero, setRemoveHero] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(benefit.name);
      setBody(benefit.body ?? "");
      setLogoFile(null);
      setHeroFile(null);
      setRemoveLogo(false);
      setRemoveHero(false);
    }
  }, [open, benefit]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toastError("Navn mangler");
    setSaving(true);
    try {
      let logoPath = benefit.logo_path;
      let heroPath = benefit.hero_image_path;

      if (removeLogo && benefit.logo_path) {
        await supabase.storage.from(BUCKET).remove([benefit.logo_path]);
        logoPath = null;
      }
      if (logoFile) {
        if (benefit.logo_path && !removeLogo) await supabase.storage.from(BUCKET).remove([benefit.logo_path]);
        logoPath = await uploadImage(logoFile, user?.id, "logo");
      }
      if (removeHero && benefit.hero_image_path) {
        await supabase.storage.from(BUCKET).remove([benefit.hero_image_path]);
        heroPath = null;
      }
      if (heroFile) {
        if (benefit.hero_image_path && !removeHero) await supabase.storage.from(BUCKET).remove([benefit.hero_image_path]);
        heroPath = await uploadImage(heroFile, user?.id, "hero");
      }

      const { error } = await (supabase as any)
        .from("partner_benefits")
        .update({
          name: name.trim(),
          body: body.trim() || null,
          logo_path: logoPath,
          hero_image_path: heroPath,
        })
        .eq("id", benefit.id);
      if (error) throw error;

      toast.success("Aftale opdateret");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-partner-benefits"] });
      qc.invalidateQueries({ queryKey: ["admin-partner-images"] });
      qc.invalidateQueries({ queryKey: ["partner-benefits"] });
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rediger partneraftale</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSave}>
          <div className="space-y-2">
            <Label>Navn</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
          </div>
          <div className="space-y-2">
            <Label>Logo</Label>
            {benefit.logo_path && !removeLogo && !logoFile && <p className="text-xs text-muted-foreground">Nuværende logo er vedhæftet.</p>}
            <Input type="file" accept="image/*" onChange={(e) => { setLogoFile(e.target.files?.[0] ?? null); setRemoveLogo(false); }} />
            {logoFile && <p className="text-xs text-muted-foreground">Nyt logo: {logoFile.name}</p>}
            {benefit.logo_path && !logoFile && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={removeLogo} onChange={(e) => setRemoveLogo(e.target.checked)} />
                Fjern nuværende logo
              </label>
            )}
          </div>
          <div className="space-y-2">
            <Label>Topbillede</Label>
            {benefit.hero_image_path && !removeHero && !heroFile && <p className="text-xs text-muted-foreground">Nuværende topbillede er vedhæftet.</p>}
            <Input type="file" accept="image/*" onChange={(e) => { setHeroFile(e.target.files?.[0] ?? null); setRemoveHero(false); }} />
            {heroFile && <p className="text-xs text-muted-foreground">Nyt topbillede: {heroFile.name}</p>}
            {benefit.hero_image_path && !heroFile && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={removeHero} onChange={(e) => setRemoveHero(e.target.checked)} />
                Fjern nuværende topbillede
              </label>
            )}
          </div>
          <div className="space-y-2">
            <Label>Beskrivelse</Label>
            <RichTextEditor value={body} onChange={setBody} minHeight={200} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
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
