import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Check } from "lucide-react";
import { getSystemNotifications, markSystemRead } from "@/lib/messages.functions";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/beskeder/system")({
  component: SystemThread,
});

function SystemThread() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ["msg-system"],
    queryFn: () => getSystemNotifications(),
  });

  // Mark all as read on open
  useEffect(() => {
    void markSystemRead({}).then(() => {
      qc.invalidateQueries({ queryKey: ["msg-threads"] });
      qc.invalidateQueries({ queryKey: ["unread-total"] });
    });
  }, [qc]);

  const items = data?.items ?? [];

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
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">System</p>
          <p className="text-xs text-muted-foreground">Notifikationer fra siden — du kan ikke svare her.</p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={() => refetch()}>
          <Check className="h-3.5 w-3.5" /> Opdatér
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Ingen notifikationer endnu.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((n: any) => {
              const inner = (
                <div className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-accent">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: da })}
                    </span>
                  </div>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <button
                      onClick={() => navigate({ to: n.link })}
                      className="block w-full text-left"
                    >
                      {inner}
                    </button>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
