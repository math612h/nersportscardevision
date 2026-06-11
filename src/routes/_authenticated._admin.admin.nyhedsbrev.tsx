import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Newspaper, Trash2, Loader2, Image as ImageIcon, Pencil } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_admin/admin/nyhedsbrev")({
  component: NyhedsbrevAdmin,
});

type NewsPost = {
  id: string;
  title: string;
  body: string | null;
  image_path: string | null;
  expires_at: string;
  created_at: string;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return toLocalInput(d.toISOString());
}

function NyhedsbrevAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiresAt, setExpiresAt] = useState<string>(defaultExpiresAt());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["admin-news-posts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("news_posts")
        .select("id,title,body,image_path,expires_at,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NewsPost[];
    },
  });

  const imagePaths = (posts ?? []).map((p) => p.image_path).filter((p): p is string => !!p);
  const { data: imageMap } = useQuery({
    queryKey: ["admin-news-images", imagePaths.sort().join(",")],
    enabled: imagePaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("news-images")
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
    mutationFn: async (post: NewsPost) => {
      if (post.image_path) {
        await supabase.storage.from("news-images").remove([post.image_path]);
      }
      const { error } = await (supabase as any).from("news_posts").delete().eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nyhed slettet");
      qc.invalidateQueries({ queryKey: ["admin-news-posts"] });
      qc.invalidateQueries({ queryKey: ["home-news-posts"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Kunne ikke slette"),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Overskrift mangler");
      return;
    }
    if (!expiresAt) {
      toast.error("Vælg udløbsdato");
      return;
    }
    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime()) || exp.getTime() <= Date.now()) {
      toast.error("Udløbstidspunkt skal ligge i fremtiden");
      return;
    }
    setSubmitting(true);
    try {
      let imagePath: string | null = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${user?.id ?? "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("news-images")
          .upload(path, imageFile, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        imagePath = path;
      }
      const { error } = await (supabase as any).from("news_posts").insert({
        title: title.trim(),
        body: body.trim() || null,
        image_path: imagePath,
        expires_at: exp.toISOString(),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Nyhed oprettet");
      setTitle("");
      setBody("");
      setImageFile(null);
      setExpiresAt(defaultExpiresAt());
      qc.invalidateQueries({ queryKey: ["admin-news-posts"] });
      qc.invalidateQueries({ queryKey: ["home-news-posts"] });
    } catch (err: any) {
      toast.error(err.message ?? "Kunne ikke oprette nyhed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Newspaper className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Nyhedsbrev</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ny nyhed</CardTitle>
          <CardDescription>
            Vises på forsiden indtil udløbsdatoen. Du kan tilføje et billede der vises stort nederst i nyheden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="news-title">Overskrift</Label>
              <Input
                id="news-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Fx: Ny sæson starter snart"
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="news-body">Tekst</Label>
              <Textarea
                id="news-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Skriv nyhedsteksten her…"
                rows={5}
                maxLength={5000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="news-expires">Forsvinder den</Label>
              <Input
                id="news-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Nyheden vises på forsiden indtil dette tidspunkt.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="news-image">Billede (valgfrit)</Label>
              <Input
                id="news-image"
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
              {imageFile && (
                <p className="text-xs text-muted-foreground">{imageFile.name}</p>
              )}
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Opret nyhed
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Eksisterende nyheder</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Indlæser…</p>}
        {!isLoading && (posts ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen nyheder endnu.</p>
        )}
        <div className="space-y-3">
          {(posts ?? []).map((p) => {
            const expired = new Date(p.expires_at).getTime() <= Date.now();
            return (
              <Card key={p.id} className={expired ? "opacity-60" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{p.title}</CardTitle>
                      <CardDescription>
                        {expired ? "Udløbet " : "Forsvinder "}
                        {format(new Date(p.expires_at), "dd MMM yyyy HH:mm")}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      <EditNewsDialog post={p} />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMut.mutate(p)}
                        disabled={deleteMut.isPending}
                        aria-label="Slet nyhed"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {(p.body || p.image_path) && (
                  <CardContent className="space-y-3">
                    {p.body && <p className="whitespace-pre-wrap text-sm">{p.body}</p>}
                    {p.image_path && (
                      imageMap?.[p.image_path] ? (
                        <img
                          src={imageMap[p.image_path]}
                          alt={p.title}
                          className="w-full rounded-md border border-border"
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ImageIcon className="h-3.5 w-3.5" /> Billede vedhæftet
                        </div>
                      )
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EditNewsDialog({ post }: { post: NewsPost }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body ?? "");
  const [expiresAt, setExpiresAt] = useState<string>(toLocalInput(post.expires_at));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(post.title);
      setBody(post.body ?? "");
      setExpiresAt(toLocalInput(post.expires_at));
      setImageFile(null);
      setRemoveImage(false);
    }
  }, [open, post]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Overskrift mangler");
    if (!expiresAt) return toast.error("Vælg udløbsdato");
    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime())) return toast.error("Ugyldig dato");

    setSaving(true);
    try {
      let imagePath: string | null = post.image_path;

      if (removeImage && post.image_path) {
        await supabase.storage.from("news-images").remove([post.image_path]);
        imagePath = null;
      }

      if (imageFile) {
        // Slet det gamle billede hvis der findes et
        if (post.image_path && !removeImage) {
          await supabase.storage.from("news-images").remove([post.image_path]);
        }
        const ext = imageFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const newPath = `${user?.id ?? "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("news-images")
          .upload(newPath, imageFile, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        imagePath = newPath;
      }

      const { error } = await (supabase as any)
        .from("news_posts")
        .update({
          title: title.trim(),
          body: body.trim() || null,
          image_path: imagePath,
          expires_at: exp.toISOString(),
        })
        .eq("id", post.id);
      if (error) throw error;

      toast.success("Nyhed opdateret");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-news-posts"] });
      qc.invalidateQueries({ queryKey: ["home-news-posts"] });
      qc.invalidateQueries({ queryKey: ["admin-news-images"] });
      qc.invalidateQueries({ queryKey: ["home-news-images"] });
    } catch (err: any) {
      toast.error(err.message ?? "Kunne ikke gemme nyhed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Rediger nyhed">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rediger nyhed</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSave}>
          <div className="space-y-2">
            <Label>Overskrift</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </div>
          <div className="space-y-2">
            <Label>Tekst</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} />
          </div>
          <div className="space-y-2">
            <Label>Forsvinder den</Label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Billede</Label>
            {post.image_path && !removeImage && !imageFile && (
              <p className="text-xs text-muted-foreground">Nuværende billede er vedhæftet.</p>
            )}
            <Input type="file" accept="image/*" onChange={(e) => { setImageFile(e.target.files?.[0] ?? null); setRemoveImage(false); }} />
            {imageFile && <p className="text-xs text-muted-foreground">Nyt billede: {imageFile.name}</p>}
            {post.image_path && !imageFile && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={removeImage}
                  onChange={(e) => setRemoveImage(e.target.checked)}
                />
                Fjern nuværende billede
              </label>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Gem
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
