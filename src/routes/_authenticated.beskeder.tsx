import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, Search, MessageSquare } from "lucide-react";
import { listThreads, searchUsers } from "@/lib/messages.functions";
import { UserAvatarOnly } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/beskeder")({
  head: () => ({ meta: [{ title: "Beskeder — LMU Danmark" }] }),
  component: MessagesLayout,
});

function MessagesLayout() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const [q, setQ] = useState("");

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

  // Realtime: refetch threads + active thread when new DM arrives
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
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, refetch, qc]);

  const isIndex = location.pathname === "/beskeder" || location.pathname === "/beskeder/";
  const threads = data?.threads ?? [];
  const system = data?.system;

  // Build sidebar items: system first, then DM threads, then search results not yet in threads
  const threadIds = new Set(threads.map((t) => t.otherUserId));
  const extraUsers = (search?.users ?? []).filter((u: any) => !threadIds.has(u.id));

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-1 gap-0 md:grid-cols-[320px_1fr] md:overflow-hidden md:rounded-lg md:border md:border-border">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex h-full min-h-0 flex-col border-border md:border-r",
          isIndex ? "block" : "hidden md:flex",
        )}
      >
        <div className="border-b border-border p-3">
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
          {/* System thread */}
          <Link
            to="/beskeder/system"
            className="flex items-center gap-3 border-b border-border px-3 py-3 hover:bg-accent"
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

          {threads.map((t) => (
            <Link
              key={t.otherUserId}
              to="/beskeder/$threadId"
              params={{ threadId: t.otherUserId }}
              className="flex items-center gap-3 border-b border-border px-3 py-3 hover:bg-accent"
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
            <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
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

          {threads.length === 0 && extraUsers.length === 0 && q.trim().length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Ingen samtaler endnu. Søg efter en bruger for at starte en chat.
            </div>
          )}
        </div>
      </aside>

      {/* Main pane */}
      <section className={cn("flex h-full min-h-0 flex-col", isIndex ? "hidden md:flex" : "flex")}>
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
    </div>
  );
}
