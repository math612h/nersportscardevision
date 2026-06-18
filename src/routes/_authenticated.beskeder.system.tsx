import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Check, UserPlus, X } from "lucide-react";
import { getSystemNotifications, markSystemRead } from "@/lib/messages.functions";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";

export const Route = createFileRoute("/_authenticated/beskeder/system")({
  component: SystemThread,
});

type PendingInvite = {
  id: string;
  team_id: string;
  created_at: string;
  team_name: string;
};

function SystemThread() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, refetch } = useQuery({
    queryKey: ["msg-system"],
    queryFn: () => getSystemNotifications(),
  });

  const { data: invites, refetch: refetchInvites } = useQuery({
    queryKey: ["my-pending-team-invites", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<PendingInvite[]> => {
      const { data, error } = await (supabase as any)
        .from("team_invitations")
        .select("id, team_id, created_at, teams:team_id(name)")
        .eq("user_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        team_id: r.team_id,
        created_at: r.created_at,
        team_name: r.teams?.name ?? "Team",
      }));
    },
  });

  // Mark all as read on open
  useEffect(() => {
    void markSystemRead({}).then(() => {
      qc.invalidateQueries({ queryKey: ["msg-threads"] });
      qc.invalidateQueries({ queryKey: ["unread-total"] });
    });
  }, [qc]);

  const accept = useMutation({
    mutationFn: async (inv: PendingInvite) => {
      const { error: updErr } = await (supabase as any)
        .from("team_invitations")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", inv.id);
      if (updErr) throw updErr;
      const { error: insErr } = await (supabase as any)
        .from("team_members")
        .insert({ team_id: inv.team_id, user_id: user!.id, role: "member" });
      if (insErr) throw insErr;
    },
    onSuccess: (_d, inv) => {
      toast.success(`Du er nu medlem af ${inv.team_name}!`);
      void refetchInvites();
      qc.invalidateQueries({ queryKey: ["my-teams"] });
      qc.invalidateQueries({ queryKey: ["team-members", inv.team_id] });
    },
    onError: (e: Error) => toastError(e.message),
  });

  const reject = useMutation({
    mutationFn: async (inv: PendingInvite) => {
      const { error } = await (supabase as any)
        .from("team_invitations")
        .update({ status: "rejected", responded_at: new Date().toISOString() })
        .eq("id", inv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation afvist");
      void refetchInvites();
    },
    onError: (e: Error) => toastError(e.message),
  });

  const items = data?.items ?? [];
  const pendingInvites = invites ?? [];
  const busyId = accept.isPending
    ? (accept.variables as PendingInvite | undefined)?.id
    : reject.isPending
      ? (reject.variables as PendingInvite | undefined)?.id
      : undefined;

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
        <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={() => { void refetch(); void refetchInvites(); }}>
          <Check className="h-3.5 w-3.5" /> Opdatér
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {pendingInvites.length > 0 && (
          <ul className="flex flex-col gap-2">
            {pendingInvites.map((inv) => {
              const busy = busyId === inv.id;
              return (
                <li key={inv.id}>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <UserPlus className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-sm font-medium">
                          Du er blevet inviteret til at joine "{inv.team_name}"
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true, locale: da })}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1 bg-blue-600 text-white hover:bg-blue-700"
                        disabled={busy}
                        onClick={() => accept.mutate(inv)}
                      >
                        <Check className="h-3.5 w-3.5" /> Accepter
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        disabled={busy}
                        onClick={() => reject.mutate(inv)}
                      >
                        <X className="h-3.5 w-3.5" /> Afvis
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {items.length === 0 && pendingInvites.length === 0 ? (
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
