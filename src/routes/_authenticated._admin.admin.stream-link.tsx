import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Trash2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getLiveStatus, setManualStreamLink } from "@/lib/broadcast-live.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/stream-link")({
  head: () => ({
    meta: [
      { title: "Stream link – Kontrolpanel" },
      { name: "description", content: "Styr hvilken YouTube-livestream der vises på forsiden." },
      { property: "og:title", content: "Stream link – Kontrolpanel" },
      { property: "og:description", content: "Styr hvilken YouTube-livestream der vises på forsiden." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminStreamLink,
});

function AdminStreamLink() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getLiveStatus);
  const saveLink = useServerFn(setManualStreamLink);

  const { data: status } = useQuery({
    queryKey: ["broadcast-live-status"],
    queryFn: () => fetchStatus(),
  });

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status && !loaded) {
      setUrl(status.manualVideoId ? `https://www.youtube.com/watch?v=${status.manualVideoId}` : "");
      setTitle(status.manualTitle ?? "");
      setEnabled(status.manualEnabled);
      setLoaded(true);
    }
  }, [status, loaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveLink({ data: { url, title: title || undefined, enabled } });
      toast.success(enabled ? "Stream-linket vises nu på forsiden." : "Stream-linket er gemt, men slået fra.");
      queryClient.invalidateQueries({ queryKey: ["broadcast-live-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke gemme stream-linket.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await saveLink({ data: { url: "", enabled: false } });
      setUrl("");
      setTitle("");
      setEnabled(false);
      toast.success("Stream-linket er fjernet fra forsiden.");
      queryClient.invalidateQueries({ queryKey: ["broadcast-live-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke fjerne stream-linket.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Stream link</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Youtube className="h-4 w-4 text-primary" /> Livestream på forsiden
          </CardTitle>
          <CardDescription>
            Indsæt et link til den YouTube-livestream, der skal vises på forsiden. Streamen kan afspilles
            direkte på forsiden og linker samtidig til YouTube. Mens vi rent faktisk er live, vises
            live-streamen automatisk i stedet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stream-url">YouTube-link</Label>
            <Input
              id="stream-url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Både almindelige video-links, youtu.be-links og live-links virker.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stream-title">Titel (valgfri)</Label>
            <Input
              id="stream-title"
              placeholder="Fx LMU Danmark ICE Cup – Afdeling 5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Vis på forsiden</p>
              <p className="text-xs text-muted-foreground">
                Når den er slået til, erstatter linket den automatiske seneste livestream.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={saving || (enabled && !url.trim())}>
              {saving ? "Gemmer…" : "Gem"}
            </Button>
            <Button variant="outline" onClick={handleRemove} disabled={saving || (!url && !status?.manualVideoId)}>
              <Trash2 className="mr-2 h-4 w-4" /> Fjern link
            </Button>
          </div>

          {status?.manualVideoId && (
            <p className="text-xs text-muted-foreground">
              Aktuelt gemt:{" "}
              <a
                href={`https://www.youtube.com/watch?v=${status.manualVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {status.manualTitle || `youtube.com/watch?v=${status.manualVideoId}`}
              </a>{" "}
              ({status.manualEnabled ? "synlig på forsiden" : "slået fra"})
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
