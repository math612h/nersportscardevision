import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, Search, MessageSquare, Users, Plus } from "lucide-react";
import { listThreads, searchUsers } from "@/lib/messages.functions";
import { UserAvatarOnly } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateGroupDialog } from "@/components/CreateGroupDialog";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/beskeder")({
  head: () => ({ meta: [{ title: "Beskeder — LMU Danmark" }] }),
  component: MessagesLayout,
});

function MessagesLayout() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["msg-threads"],
    queryFn: () => listThreads(),
    refetchInterval: 30_000,
  });

  const { data: search } = useQuery({
    queryKey: ["msg-user-search", q],
    enabled: q.trim().length >= 1,
    queryFn: () => searchUsers({ data: { q: q.trim() } }),
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`dm-incoming-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
        () => {
          void refetch();
          qc.invalidateQueries({ queryKey: ["msg-thread"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          void refetch();
          qc.invalidateQueries({ queryKey: ["msg-system"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages" },
        () => void refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_group_members", filter: `user_id=eq.${user.id}` },
        () => void refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, refetch, qc]);

  const isIndex = location.pathname === "/beskeder" || location.pathname === "/beskeder/";
  const threads = data?.threads ?? [];
  const groups = data?.groups ?? [];
  const system = data?.system;

  const threadIds = new Set(threads.map((t) => t.otherUserId));
  const extraUsers = (search?.users ?? []).filter((u: any) => !threadIds.has(u.id));

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-1 gap-0 md:grid-cols-[320px_1fr] md:overflow-hidden md:rounded-lg md:border md:border-border md:bg-card md:shadow-sm">
      <aside
        className={cn(
          "flex h-full min-h-0 flex-col border-border md:border-r",
          isIndex ? "block" : "hidden md:flex",
        )}
      >
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Beskeder</h2>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Ny gruppe
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Søg bruger…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* System */}
          <Link
            to="/beskeder/system"
            className="flex items-center gap-3 border-b border-border px-3 py-3 transition-colors hover:bg-accent"
            activeProps={{ className: "bg-accent" }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">System</p>
                {system?.lastAt && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(system.lastAt), { addSuffix: false, locale: da })}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {system?.lastTitle ?? "Notifikationer fra siden"}
              </p>
            </div>
            {system && system.unread > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{system.unread}</Badge>
            )}
          </Link>

          {/* Groups */}
          {groups.length > 0 && (
            <div className="border-b border-border bg-muted/30 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Grupper
            </div>
          )}
          {groups.map((g) => (
            <Link
              key={g.groupId}
              to="/beskeder/gruppe/$groupId"
              params={{ groupId: g.groupId }}
              className="flex items-center gap-3 border-b border-border px-3 py-3 transition-colors hover:bg-accent"
              activeProps={{ className: "bg-accent" }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  {g.lastAt && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(g.lastAt), { addSuffix: false, locale: da })}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {g.lastBody
                    ? `${g.lastSenderId === user?.id ? "Du: " : ""}${g.lastBody}`
                    : `${g.memberIds.length} medlemmer`}
                </p>
              </div>
              {g.unread > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{g.unread}</Badge>
              )}
            </Link>
          ))}

          {/* DMs */}
          {threads.length > 0 && (
            <div className="border-b border-border bg-muted/30 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Direkte beskeder
            </div>
          )}
          {threads.map((t) => (
            <Link
              key={t.otherUserId}
              to="/beskeder/$threadId"
              params={{ threadId: t.otherUserId }}
              className="flex items-center gap-3 border-b border-border px-3 py-3 transition-colors hover:bg-accent"
              activeProps={{ className: "bg-accent" }}
            >
              <UserAvatarOnly userId={t.otherUserId} fallbackName={t.otherName} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{t.otherName || "Ukendt bruger"}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(t.lastAt), { addSuffix: false, locale: da })}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {t.lastSenderId === user?.id ? "Du: " : ""}{t.lastBody}
                </p>
              </div>
              {t.unread > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{t.unread}</Badge>
              )}
            </Link>
          ))}

          {extraUsers.length > 0 && (
            <div className="border-b border-border bg-muted/30 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Andre brugere
            </div>
          )}
          {extraUsers.map((u: any) => (
            <Link
              key={u.id}
              to="/beskeder/$threadId"
              params={{ threadId: u.id }}
              className="flex items-center gap-3 border-b border-border px-3 py-3 hover:bg-accent"
            >
              <UserAvatarOnly userId={u.id} fallbackName={u.display_name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{u.display_name ?? "Ukendt"}</p>
                <p className="truncate text-xs text-muted-foreground">Start ny samtale</p>
              </div>
            </Link>
          ))}

          {threads.length === 0 && groups.length === 0 && extraUsers.length === 0 && q.trim().length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Ingen samtaler endnu. Søg efter en bruger eller opret en gruppe.
            </div>
          )}
        </div>
      </aside>

      <section className={cn("flex h-full min-h-0 flex-col bg-background", isIndex ? "hidden md:flex" : "flex")}>
        {isIndex ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
            <div>
              <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
              Vælg en samtale i listen.
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </section>

      <CreateGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate({ to: "/beskeder/gruppe/$groupId", params: { groupId: id } })}
      />
    </div>
  );
}
