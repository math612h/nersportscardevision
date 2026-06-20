import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { MessageSquare, Pencil, Plus, Trash2, Send, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  listMessageTemplates,
  upsertMessageTemplate,
  deleteMessageTemplate,
  listDiscordChannels,
  postTemplateToDiscord,
  type MessageTemplate,
  type DiscordChannel,
} from "@/lib/message-templates.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/beskeder")({
  head: () => ({ meta: [{ title: "Besked Hub – Admin" }] }),
  component: BeskedHub,
});

function BeskedHub() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMessageTemplates);
  const upsertFn = useServerFn(upsertMessageTemplate);
  const deleteFn = useServerFn(deleteMessageTemplate);
  const channelsFn = useServerFn(listDiscordChannels);
  const postFn = useServerFn(postTemplateToDiscord);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => listFn(),
  });

  const { data: channels } = useQuery({
    queryKey: ["discord-channels"],
    queryFn: () => channelsFn(),
  });

  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<MessageTemplate | null>(null);

  const saveMut = useMutation({
    mutationFn: async (vars: { id?: string; key: string; title: string; body: string; default_channel_id: string | null }) => {
      await upsertFn({ data: vars });
    },
    onSuccess: () => {
      toast.success("Gemt.");
      setEditing(null);
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await deleteFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Slettet.");
      qc.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const postMut = useMutation({
    mutationFn: async (vars: { templateId: string; channelId: string }) => {
      await postFn({ data: vars });
    },
    onSuccess: () => {
      toast.success("Sendt til Discord.");
      setSharing(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" />Tilbage</Link>
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Besked Hub</h1>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Ny besked
        </Button>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Her kan du redigere alle de standard-beskeder som systemet sender ud — fx velkomst-besked til #velkomst, navne-rettelse til afventende brugere, og godkendelses-besked. Tryk på blyanten for at redigere, eller "Del på Discord" for at poste den i en kanal.
      </p>

      {isLoading ? (
        <div className="text-muted-foreground">Indlæser…</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(templates ?? []).map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{t.title}</CardTitle>
                  {t.is_system && <Badge variant="secondary">System</Badge>}
                </div>
                <CardDescription className="font-mono text-xs">{t.key}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between gap-3">
                <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">{t.body}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)} className="gap-1">
                    <Pencil className="h-3.5 w-3.5" /> Rediger
                  </Button>
                  <Button size="sm" variant="default" onClick={() => setSharing(t)} className="gap-1">
                    <Send className="h-3.5 w-3.5" /> Del på Discord
                  </Button>
                  {!t.is_system && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Slet denne besked?")) deleteMut.mutate(t.id);
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateEditor
        open={!!editing || creating}
        template={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSave={(vals) => saveMut.mutate(vals)}
        saving={saveMut.isPending}
      />

      <ShareDialog
        open={!!sharing}
        template={sharing}
        channels={channels ?? []}
        onClose={() => setSharing(null)}
        onPost={(channelId) => sharing && postMut.mutate({ templateId: sharing.id, channelId })}
        posting={postMut.isPending}
      />
    </div>
  );
}

function TemplateEditor({
  open,
  template,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  template: MessageTemplate | null;
  onClose: () => void;
  onSave: (vals: { id?: string; key: string; title: string; body: string; default_channel_id: string | null }) => void;
  saving: boolean;
}) {
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) {
      setKey(template?.key ?? "");
      setTitle(template?.title ?? "");
      setBody(template?.body ?? "");
    }
  }, [open, template]);

  const isNew = !template;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Ny besked" : "Rediger besked"}</DialogTitle>
          <DialogDescription>
            {template?.is_system
              ? "Dette er en system-besked — du kan ændre titel og indhold, men ikke nøglen."
              : "Brug en kort, unik nøgle som koden kan kalde på (fx 'velkomst_efter_godkendelse')."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nøgle</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} disabled={!isNew} placeholder="fx custom_announcement" />
          </div>
          <div>
            <Label>Titel / overskrift</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>Indhold</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              maxLength={4000}
              placeholder="Skriv beskeden her. Brug {discord_invite} for at indsætte invitations-linket."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Du kan bruge <code>{"{discord_invite}"}</code> som placeholder — den erstattes automatisk med Discord-invitationslinket.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
          <Button
            disabled={saving || !key.trim() || !title.trim() || !body.trim()}
            onClick={() =>
              onSave({
                id: template?.id,
                key: key.trim(),
                title: title.trim(),
                body: body.trim(),
                default_channel_id: template?.default_channel_id ?? null,
              })
            }
          >
            {saving ? "Gemmer…" : "Gem ændring"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({
  open,
  template,
  channels,
  onClose,
  onPost,
  posting,
}: {
  open: boolean;
  template: MessageTemplate | null;
  channels: DiscordChannel[];
  onClose: () => void;
  onPost: (channelId: string) => void;
  posting: boolean;
}) {
  const [channelId, setChannelId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setChannelId(template?.default_channel_id ?? "");
    }
  }, [open, template]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Del på Discord</DialogTitle>
          <DialogDescription>
            Vælg den kanal hvor "{template?.title}" skal sendes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Kanal</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue placeholder="Vælg kanal…" /></SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
          <Button disabled={!channelId || posting} onClick={() => onPost(channelId)}>
            {posting ? "Sender…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
