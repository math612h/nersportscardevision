import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Users, Pencil, UserPlus, LogOut, X, Check } from "lucide-react";
import {
  getGroup,
  sendGroupMessage,
  renameGroup,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
  searchUsers,
} from "@/lib/messages.functions";
import { UserAvatarOnly } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { da } from "date-fns/locale";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/beskeder/gruppe/$groupId")({
  component: GroupView,
});

function GroupView() {
  const { groupId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["msg-group", groupId],
    queryFn: () => getGroup({ data: { groupId } }),
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`grp-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        () => {
          void refetch();
          qc.invalidateQueries({ queryKey: ["msg-threads"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_group_members", filter: `group_id=eq.${groupId}` },
        () => void refetch(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_groups", filter: `id=eq.${groupId}` },
        () => {
          void refetch();
          qc.invalidateQueries({ queryKey: ["msg-threads"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, groupId, refetch, qc]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length]);

  useEffect(() => {
    taRef.current?.focus();
  }, [groupId]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendGroupMessage({ data: { groupId, body } });
      setText("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["msg-threads"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke sende beskeden");
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  };

  const group = data?.group;
  const members = data?.members ?? [];
  const messages = data?.messages ?? [];
  const memberMap = new Map(members.map((m: any) => [m.id, m]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-background/60 p-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => navigate({ to: "/beskeder" })}
          aria-label="Tilbage"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Users className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{group?.name ?? "Gruppe"}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {members.length} medlem{members.length === 1 ? "" : "mer"}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Indstillinger">
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <p className="text-center text-xs text-muted-foreground">Indlæser…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">
            Ingen beskeder endnu. Skriv den første!
          </p>
        ) : (
          <MessageList messages={messages} memberMap={memberMap as any} meId={user?.id} />
        )}
      </div>

      <div className="border-t border-border bg-background/60 p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder="Skriv en besked…"
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button onClick={handleSend} disabled={!text.trim() || sending} size="icon" aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <GroupSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        groupId={groupId}
        currentName={group?.name ?? ""}
        members={members as any}
        meId={user?.id ?? ""}
        onChanged={() => {
          void refetch();
          qc.invalidateQueries({ queryKey: ["msg-threads"] });
        }}
        onLeave={() => navigate({ to: "/beskeder" })}
      />
    </div>
  );
}

function MessageList({
  messages,
  memberMap,
  meId,
}: {
  messages: Array<{ id: string; sender_id: string; body: string; created_at: string }>;
  memberMap: Map<string, { id: string; display_name: string | null; avatar_url: string | null }>;
  meId?: string;
}) {
  // Group by day
  let lastDay = "";
  let lastSender = "";
  return (
    <ul className="flex flex-col gap-1">
      {messages.map((m) => {
        const mine = m.sender_id === meId;
        const sender = memberMap.get(m.sender_id);
        const dayKey = format(new Date(m.created_at), "yyyy-MM-dd");
        const showDay = dayKey !== lastDay;
        const showSender = !mine && lastSender !== m.sender_id;
        lastDay = dayKey;
        lastSender = m.sender_id;
        const d = new Date(m.created_at);
        const dayLabel = isToday(d)
          ? "I dag"
          : isYesterday(d)
            ? "I går"
            : format(d, "d. MMM yyyy", { locale: da });
        return (
          <li key={m.id} className="flex flex-col">
            {showDay && (
              <div className="my-2 flex items-center justify-center">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {dayLabel}
                </span>
              </div>
            )}
            <div className={cn("flex gap-2", mine ? "justify-end" : "justify-start")}>
              {!mine && (
                <div className={cn("w-7 shrink-0", showSender ? "" : "invisible")}>
                  <UserAvatarOnly userId={m.sender_id} fallbackName={sender?.display_name ?? "?"} size="sm" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-3 py-1.5 text-sm",
                  mine
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground",
                )}
              >
                {!mine && showSender && (
                  <p className="text-[10px] font-medium opacity-70">{sender?.display_name ?? "Ukendt"}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn("mt-0.5 text-[10px] opacity-60", mine ? "text-right" : "")}>
                  {format(d, "HH:mm")}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function GroupSettingsDialog({
  open,
  onOpenChange,
  groupId,
  currentName,
  members,
  meId,
  onChanged,
  onLeave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  currentName: string;
  members: Array<{ id: string; display_name: string | null }>;
  meId: string;
  onChanged: () => void;
  onLeave: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const { data: search } = useQuery({
    queryKey: ["grp-user-search", q],
    enabled: open && q.trim().length >= 1,
    queryFn: () => searchUsers({ data: { q: q.trim() } }),
  });

  const memberIds = new Set(members.map((m) => m.id));

  const save = async () => {
    if (!name.trim() || name.trim() === currentName) return;
    try {
      await renameGroup({ data: { groupId, name: name.trim() } });
      toast.success("Navn opdateret");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke omdøbe");
    }
  };

  const add = async (uid: string) => {
    try {
      await addGroupMember({ data: { groupId, userId: uid } });
      onChanged();
      setQ("");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke tilføje");
    }
  };

  const remove = async (uid: string) => {
    try {
      await removeGroupMember({ data: { groupId, userId: uid } });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke fjerne");
    }
  };

  const leave = async () => {
    if (!confirm("Forlad gruppen?")) return;
    try {
      await leaveGroup({ data: { groupId } });
      onOpenChange(false);
      onLeave();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke forlade");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gruppeindstillinger</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium">Gruppenavn</label>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              <Button onClick={save} disabled={!name.trim() || name.trim() === currentName} size="sm">
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">Medlemmer ({members.length})</label>
            <ul className="space-y-1 rounded-md border border-border">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-2 py-1.5">
                  <UserAvatarOnly userId={m.id} fallbackName={m.display_name ?? "?"} size="sm" />
                  <span className="flex-1 truncate text-sm">{m.display_name ?? "Ukendt"}{m.id === meId ? " (dig)" : ""}</span>
                  {m.id !== meId && (
                    <Button variant="ghost" size="icon" onClick={() => remove(m.id)} aria-label="Fjern">
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">
              <UserPlus className="mr-1 inline h-3.5 w-3.5" /> Tilføj medlem
            </label>
            <Input placeholder="Søg bruger…" value={q} onChange={(e) => setQ(e.target.value)} />
            {search?.users && search.users.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-border">
                {search.users
                  .filter((u: any) => !memberIds.has(u.id))
                  .map((u: any) => (
                    <li key={u.id} className="flex items-center gap-2 px-2 py-1.5">
                      <UserAvatarOnly userId={u.id} fallbackName={u.display_name ?? "?"} size="sm" />
                      <span className="flex-1 truncate text-sm">{u.display_name ?? "Ukendt"}</span>
                      <Button variant="ghost" size="sm" onClick={() => add(u.id)}>
                        Tilføj
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={leave} className="gap-1 text-destructive">
            <LogOut className="h-4 w-4" /> Forlad gruppe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
