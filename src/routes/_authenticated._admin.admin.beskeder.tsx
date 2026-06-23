import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Send,
  ArrowLeft,
  Hash,
  Mail,
  Trophy,
  Search,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listMessageTemplates,
  upsertMessageTemplate,
  deleteMessageTemplate,
  listDiscordChannels,
  listDiscordRoles,
  postTemplateToDiscord,
  type MessageTemplate,
  type MessageTemplateKind,
  type DiscordChannel,
  type DiscordRole,
} from "@/lib/message-templates.functions";
import { sendTransactionalEmail } from "@/lib/email/send";

export const Route = createFileRoute("/_authenticated/_admin/admin/beskeder")({
  head: () => ({ meta: [{ title: "Besked Hub – Admin" }] }),
  component: BeskedHub,
});

type LeagueLite = { id: string; name: string };

function BeskedHub() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMessageTemplates);
  const upsertFn = useServerFn(upsertMessageTemplate);
  const deleteFn = useServerFn(deleteMessageTemplate);
  const channelsFn = useServerFn(listDiscordChannels);
  const rolesFn = useServerFn(listDiscordRoles);
  const postFn = useServerFn(postTemplateToDiscord);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => listFn(),
  });

  const { data: channels } = useQuery({
    queryKey: ["discord-channels"],
    queryFn: () => channelsFn(),
  });

  const { data: roles } = useQuery({
    queryKey: ["discord-roles"],
    queryFn: () => rolesFn(),
  });

  const { data: leagues } = useQuery<LeagueLite[]>({
    queryKey: ["beskeder-leagues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("id, name")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeagueLite[];
    },
  });

  const leagueMap = useMemo(() => {
    const m = new Map<string, string>();
    (leagues ?? []).forEach((l) => m.set(l.id, l.name));
    return m;
  }, [leagues]);

  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creatingKind, setCreatingKind] = useState<MessageTemplateKind | null>(null);
  const [sharing, setSharing] = useState<MessageTemplate | null>(null);
  const [emailing, setEmailing] = useState<MessageTemplate | null>(null);

  const [tab, setTab] = useState<"all" | "discord" | "email">("all");
  const [search, setSearch] = useState("");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const all = (templates ?? []) as MessageTemplate[];
    const q = search.trim().toLowerCase();
    return all.filter((t) => {
      const kind = (t.kind ?? "discord") as MessageTemplateKind;
      if (tab !== "all" && kind !== tab) return false;
      if (leagueFilter === "none" && t.league_id) return false;
      if (leagueFilter !== "all" && leagueFilter !== "none" && t.league_id !== leagueFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q)
      );
    });
  }, [templates, tab, search, leagueFilter]);

  const counts = useMemo(() => {
    const all = (templates ?? []) as MessageTemplate[];
    return {
      all: all.length,
      discord: all.filter((t) => (t.kind ?? "discord") === "discord").length,
      email: all.filter((t) => t.kind === "email").length,
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
      league_id: string | null;
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
      const body = vars.tpl.body;
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

      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/15 p-2.5 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Besked Hub</h1>
              <p className="text-sm text-muted-foreground max-w-xl mt-1">
                Alle standardbeskeder ét sted. Knyt en besked til en liga, send den i en Discord-kanal eller direkte på e-mail.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreatingKind("discord")} className="gap-1.5">
              <Hash className="h-4 w-4" /> Ny Discord-besked
            </Button>
            <Button onClick={() => setCreatingKind("email")} variant="secondary" className="gap-1.5">
              <Mail className="h-4 w-4" /> Ny e-mail-besked
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all">Alle <Badge variant="secondary" className="ml-2">{counts.all}</Badge></TabsTrigger>
            <TabsTrigger value="discord"><Hash className="h-3.5 w-3.5 mr-1" />Discord <Badge variant="secondary" className="ml-2">{counts.discord}</Badge></TabsTrigger>
            <TabsTrigger value="email"><Mail className="h-3.5 w-3.5 mr-1" />E-mail <Badge variant="secondary" className="ml-2">{counts.email}</Badge></TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex-1 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søg i titel, nøgle eller indhold…"
              className="pl-8"
            />
          </div>
          <Select value={leagueFilter} onValueChange={setLeagueFilter}>
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="Filtrer på liga" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle ligaer</SelectItem>
              <SelectItem value="none">Uden liga</SelectItem>
              {(leagues ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Indlæser…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Ingen beskeder matcher dine filtre.</p>
          </CardContent>
        </Card>
      ) : (
        <TemplateGrid
          templates={filtered}
          leagueMap={leagueMap}
          onEdit={(t) => setEditing(t)}
          onShare={(t) => setSharing(t)}
          onSendEmail={(t) => setEmailing(t)}
          onDelete={(id) => deleteMut.mutate(id)}
        />
      )}

      <TemplateEditor
        open={!!editing || !!creatingKind}
        template={editing}
        creatingKind={creatingKind}
        leagues={leagues ?? []}
        roles={roles ?? []}
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

function TemplateGrid({
  templates,
  leagueMap,
  onEdit,
  onShare,
  onSendEmail,
  onDelete,
}: {
  templates: MessageTemplate[];
  leagueMap: Map<string, string>;
  onEdit: (t: MessageTemplate) => void;
  onShare: (t: MessageTemplate) => void;
  onSendEmail: (t: MessageTemplate) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => {
        const kind = (t.kind ?? "discord") as MessageTemplateKind;
        const isEmail = kind === "email";
        const accent = isEmail
          ? "border-l-emerald-500/70 from-emerald-500/5"
          : "border-l-indigo-500/70 from-indigo-500/5";
        const leagueName = t.league_id ? leagueMap.get(t.league_id) : null;
        return (
          <Card
            key={t.id}
            className={`group flex flex-col border-l-4 bg-gradient-to-br to-background transition-shadow hover:shadow-md ${accent}`}
          >
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <Badge
                  variant="outline"
                  className={`gap-1 ${isEmail ? "text-emerald-600 border-emerald-500/30" : "text-indigo-600 border-indigo-500/30"}`}
                >
                  {isEmail ? <Mail className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                  {isEmail ? "E-mail" : "Discord"}
                </Badge>
                {t.is_system && <Badge variant="secondary" className="text-xs">System</Badge>}
              </div>

              <div className="space-y-1">
                <h3 className="font-semibold leading-tight">{t.title}</h3>
                <code className="text-[11px] text-muted-foreground font-mono">{t.key}</code>
              </div>

              {leagueName && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-medium">{leagueName}</span>
                </div>
              )}

              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap flex-1">
                {t.body}
              </p>

              <div className="flex flex-wrap gap-1.5 pt-1 border-t">
                <Button size="sm" variant="ghost" onClick={() => onEdit(t)} className="gap-1 h-8">
                  <Pencil className="h-3.5 w-3.5" /> Rediger
                </Button>
                {isEmail ? (
                  <Button size="sm" onClick={() => onSendEmail(t)} className="gap-1 h-8">
                    <Mail className="h-3.5 w-3.5" /> Send
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => onShare(t)} className="gap-1 h-8">
                    <Send className="h-3.5 w-3.5" /> Del
                  </Button>
                )}
                {!t.is_system && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Slet denne besked?")) onDelete(t.id);
                    }}
                    className="text-destructive h-8 ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TemplateEditor({
  open,
  template,
  creatingKind,
  leagues,
  roles,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  template: MessageTemplate | null;
  creatingKind: MessageTemplateKind | null;
  leagues: LeagueLite[];
  roles: DiscordRole[];
  onClose: () => void;
  onSave: (vals: {
    id?: string;
    key: string;
    title: string;
    body: string;
    kind?: MessageTemplateKind;
    default_channel_id: string | null;
    league_id: string | null;
  }) => void;
  saving: boolean;
}) {
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkLeague, setLinkLeague] = useState(false);
  const [leagueId, setLeagueId] = useState<string>("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (text: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + text);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  useEffect(() => {
    if (open) {
      setKey(template?.key ?? "");
      setTitle(template?.title ?? "");
      setBody(template?.body ?? "");
      const lid = template?.league_id ?? null;
      setLinkLeague(!!lid);
      setLeagueId(lid ?? "");
    }
  }, [open, template]);

  const isNew = !template;
  const kind: MessageTemplateKind = (template?.kind ?? creatingKind ?? "discord") as MessageTemplateKind;
  const isEmail = kind === "email";

  const canSave =
    !!key.trim() &&
    !!title.trim() &&
    !!body.trim() &&
    (!linkLeague || !!leagueId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`rounded-md p-1.5 ${isEmail ? "bg-emerald-500/15 text-emerald-600" : "bg-indigo-500/15 text-indigo-600"}`}>
              {isEmail ? <Mail className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
            </span>
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
              : "Hub-nøglen er beskedens unikke id — bruges internt og kan ikke ændres senere."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Besked-hub nøgle</Label>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={!isNew}
              placeholder="fx efteraar_2026_info"
            />
          </div>

          <div>
            <Label>{isEmail ? "Emne (titel)" : "Titel / overskrift"}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>

          {/* League link */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <Trophy className="h-4 w-4 text-amber-500 mt-0.5" />
                <div>
                  <Label className="cursor-pointer">Handler beskeden om en liga?</Label>
                  <p className="text-xs text-muted-foreground">
                    Knyt beskeden til en bestemt liga, så den er nem at finde igen.
                  </p>
                </div>
              </div>
              <Switch
                checked={linkLeague}
                onCheckedChange={(v) => {
                  setLinkLeague(v);
                  if (!v) setLeagueId("");
                }}
              />
            </div>
            {linkLeague && (
              <Select value={leagueId} onValueChange={setLeagueId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vælg liga…" />
                </SelectTrigger>
                <SelectContent>
                  {leagues.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label>Indhold</Label>
            <Textarea
              ref={bodyRef}
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
            {!isEmail && roles.length > 0 && (
              <div className="mt-2 rounded-md border bg-muted/30 p-2">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Tagge en rolle — klik for at indsætte ved markøren:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((r) => {
                    const hex = r.color
                      ? `#${r.color.toString(16).padStart(6, "0")}`
                      : undefined;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => insertAtCursor(`<@&${r.id}>`)}
                        className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs hover:bg-accent"
                        title={`Indsæt @${r.name}`}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: hex ?? "hsl(var(--muted-foreground))" }}
                        />
                        @{r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Du kan bruge <code>{"{discord_invite}"}</code> som placeholder — den erstattes automatisk med Discord-invitationslinket når beskeden bliver postet på Discord.
              {!isEmail && " Rolle-tags vises som @rolle på Discord og pinger medlemmerne."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
          <Button
            disabled={saving || !canSave}
            onClick={() =>
              onSave({
                id: template?.id,
                key: key.trim(),
                title: title.trim(),
                body: body.trim(),
                kind: isNew ? kind : undefined,
                default_channel_id: template?.default_channel_id ?? null,
                league_id: linkLeague && leagueId ? leagueId : null,
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
