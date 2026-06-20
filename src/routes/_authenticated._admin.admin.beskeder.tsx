import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Pencil, Plus, Trash2, Send, ArrowLeft, Hash, Mail } from "lucide-react";
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
  type MessageTemplateKind,
  type DiscordChannel,
} from "@/lib/message-templates.functions";
import { sendTransactionalEmail } from "@/lib/email/send";

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
  const [creatingKind, setCreatingKind] = useState<MessageTemplateKind | null>(null);
  const [sharing, setSharing] = useState<MessageTemplate | null>(null);
  const [emailing, setEmailing] = useState<MessageTemplate | null>(null);

  const { discord, email } = useMemo(() => {
    const all = templates ?? [];
    return {
      discord: all.filter((t) => (t.kind ?? "discord") === "discord"),
      email: all.filter((t) => t.kind === "email"),
    };
  }, [templates]);

  const saveMut = useMutation({
    mutationFn: async (vars: {
      id?: string;
      key: string;
      title: string;
      body: string;
      kind?: MessageTemplateKind;
      default_channel_id: string | null;
    }) => {
      await upsertFn({ data: vars });
    },
    onSuccess: () => {
      toast.success("Gemt.");
      setEditing(null);
      setCreatingKind(null);
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

  const emailMut = useMutation({
    mutationFn: async (vars: { tpl: MessageTemplate; to: string }) => {
      const body = vars.tpl.body; // {discord_invite} is left as-is in email body
      const res = await sendTransactionalEmail({
        templateName: "generic",
        recipientEmail: vars.to,
        idempotencyKey: `tpl-${vars.tpl.id}-${Date.now()}`,
        templateData: { subject: vars.tpl.title, body, preview: vars.tpl.title },
      });
      if (!res.ok) throw new Error("Kunne ikke sende e-mail.");
    },
    onSuccess: () => {
      toast.success("E-mail sendt.");
      setEmailing(null);
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
      <div className="flex items-center gap-2">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Besked Hub</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Her finder du alle standardbeskeder — opdelt i <strong>Discord-beskeder</strong> (sendes til en kanal) og <strong>E-mail-beskeder</strong> (sendes til en modtagers indbakke). Tryk på blyanten for at redigere indholdet.
      </p>

      {isLoading ? (
        <div className="text-muted-foreground">Indlæser…</div>
      ) : (
        <div className="space-y-10">
          <Section
            icon={<Hash className="h-5 w-5" />}
            title="Discord-beskeder"
            description="Beskeder der kan postes i en kanal på vores Discord-server."
            onCreate={() => setCreatingKind("discord")}
            createLabel="Ny Discord-besked"
            accent="bg-indigo-500/10 border-indigo-500/20"
          >
            <TemplateGrid
              templates={discord}
              kind="discord"
              onEdit={(t) => setEditing(t)}
              onShare={(t) => setSharing(t)}
              onSendEmail={() => {}}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          </Section>

          <Section
            icon={<Mail className="h-5 w-5" />}
            title="E-mail-beskeder"
            description="Beskeder der kan sendes til en bruger via e-mail. Titlen bliver brugt som emnefelt."
            onCreate={() => setCreatingKind("email")}
            createLabel="Ny e-mail-besked"
            accent="bg-emerald-500/10 border-emerald-500/20"
          >
            <TemplateGrid
              templates={email}
              kind="email"
              onEdit={(t) => setEditing(t)}
              onShare={() => {}}
              onSendEmail={(t) => setEmailing(t)}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          </Section>
        </div>
      )}

      <TemplateEditor
        open={!!editing || !!creatingKind}
        template={editing}
        creatingKind={creatingKind}
        onClose={() => {
          setEditing(null);
          setCreatingKind(null);
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

      <EmailDialog
        open={!!emailing}
        template={emailing}
        onClose={() => setEmailing(null)}
        onSend={(to) => emailing && emailMut.mutate({ tpl: emailing, to })}
        sending={emailMut.isPending}
      />
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  onCreate,
  createLabel,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onCreate: () => void;
  createLabel: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-lg border p-4 ${accent}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <Button size="sm" onClick={onCreate} className="gap-1">
          <Plus className="h-4 w-4" /> {createLabel}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      {children}
    </section>
  );
}

function TemplateGrid({
  templates,
  kind,
  onEdit,
  onShare,
  onSendEmail,
  onDelete,
}: {
  templates: MessageTemplate[];
  kind: MessageTemplateKind;
  onEdit: (t: MessageTemplate) => void;
  onShare: (t: MessageTemplate) => void;
  onSendEmail: (t: MessageTemplate) => void;
  onDelete: (id: string) => void;
}) {
  if (templates.length === 0) {
    return <div className="text-sm text-muted-foreground italic">Ingen beskeder endnu.</div>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <Card key={t.id} className="flex flex-col bg-background">
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
              <Button size="sm" variant="outline" onClick={() => onEdit(t)} className="gap-1">
                <Pencil className="h-3.5 w-3.5" /> Rediger
              </Button>
              {kind === "discord" ? (
                <Button size="sm" variant="default" onClick={() => onShare(t)} className="gap-1">
                  <Send className="h-3.5 w-3.5" /> Del på Discord
                </Button>
              ) : (
                <Button size="sm" variant="default" onClick={() => onSendEmail(t)} className="gap-1">
                  <Mail className="h-3.5 w-3.5" /> Send e-mail
                </Button>
              )}
              {!t.is_system && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Slet denne besked?")) onDelete(t.id);
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
  );
}

function TemplateEditor({
  open,
  template,
  creatingKind,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  template: MessageTemplate | null;
  creatingKind: MessageTemplateKind | null;
  onClose: () => void;
  onSave: (vals: {
    id?: string;
    key: string;
    title: string;
    body: string;
    kind?: MessageTemplateKind;
    default_channel_id: string | null;
  }) => void;
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
  const kind: MessageTemplateKind = (template?.kind ?? creatingKind ?? "discord") as MessageTemplateKind;
  const isEmail = kind === "email";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEmail ? <Mail className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
            {isNew
              ? isEmail
                ? "Ny e-mail-besked"
                : "Ny Discord-besked"
              : isEmail
                ? "Rediger e-mail-besked"
                : "Rediger Discord-besked"}
          </DialogTitle>
          <DialogDescription>
            {template?.is_system
              ? "Dette er en system-besked — du kan ændre titel og indhold, men ikke hub-nøglen."
              : "Hub-nøglen er beskedens unikke id — den bruges internt i systemet og kan ikke ændres senere. Brug fx 'efteraar_2026_info' eller 'ny_liga_invite'."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Besked-hub nøgle</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} disabled={!isNew} placeholder="fx efteraar_2026_info" />
          </div>
          <div>
            <Label>{isEmail ? "Emne (titel)" : "Titel / overskrift"}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>Indhold</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              maxLength={4000}
              placeholder={
                isEmail
                  ? "Skriv e-mailen her. Adskil afsnit med en tom linje."
                  : "Skriv Discord-beskeden her."
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Du kan bruge <code>{"{discord_invite}"}</code> som placeholder — den erstattes automatisk med Discord-invitationslinket når beskeden bliver postet på Discord.
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
                kind: isNew ? kind : undefined,
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

function EmailDialog({
  open,
  template,
  onClose,
  onSend,
  sending,
}: {
  open: boolean;
  template: MessageTemplate | null;
  onClose: () => void;
  onSend: (to: string) => void;
  sending: boolean;
}) {
  const [to, setTo] = useState("");

  useEffect(() => {
    if (open) setTo("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send e-mail</DialogTitle>
          <DialogDescription>
            Send "{template?.title}" til en modtager. Emnefeltet bliver beskedens titel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Modtager (e-mail)</Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="modtager@eksempel.dk"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
          <Button disabled={!to.trim() || sending} onClick={() => onSend(to.trim())}>
            {sending ? "Sender…" : "Send e-mail"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
