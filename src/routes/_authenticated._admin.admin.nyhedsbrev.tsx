import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Newspaper, Trash2, Loader2, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function defaultExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  // format for datetime-local input: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
