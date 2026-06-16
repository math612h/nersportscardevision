import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserCheck, ThumbsUp, MoreVertical, MessageSquareWarning, CheckCircle2, XCircle, HelpCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setProfileApproval } from "@/lib/leagues.functions";
import { sendAdminTemplateMessage, getAdminMessageStatus } from "@/lib/admin-messages.functions";
import { refreshPendingDiscordNicknames } from "@/lib/discord-refresh.functions";
import { checkPendingGuildMembership } from "@/lib/discord-guild.functions";
import { useEffect, useState } from "react";

function formatRelativeDk(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} time${h === 1 ? "" : "r"} siden`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} dag${d === 1 ? "" : "e"} siden`;
  return new Date(iso).toLocaleDateString("da-DK");
}

export const Route = createFileRoute("/_authenticated/_admin/admin/afventer")({
  component: PendingApprovalsPage,
});

type Profile = { id: string; display_name: string | null; created_at: string; lmu_name: string | null; discord_username?: string | null; discord_server_nickname?: string | null };

function PendingApprovalsPage() {
  const qc = useQueryClient();
  const approveFn = useServerFn(setProfileApproval);
  const sendMessageFn = useServerFn(sendAdminTemplateMessage);
  const fetchStatus = useServerFn(getAdminMessageStatus);
  const refreshNicks = useServerFn(refreshPendingDiscordNicknames);
  const checkGuildFn = useServerFn(checkPendingGuildMembership);


  const [refreshing, setRefreshing] = useState(false);

  const runRefresh = async (silent = true) => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await refreshNicks();
      if (res?.ok && res.updated > 0) {
        await qc.invalidateQueries({ queryKey: ["admin-pending-users"] });
      }
      await qc.invalidateQueries({ queryKey: ["admin-guild-status"] });
      if (!silent) {
        toast.success(
          res?.ok
            ? `Opdateret (${res.updated ?? 0} navne ændret)`
            : "Kunne ikke opdatere",
        );
      }
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Fejl ved opdatering");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void runRefresh(true);
    const id = window.setInterval(() => void runRefresh(true), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const { data, isLoading } = useQuery({
    queryKey: ["admin-pending-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, display_name, created_at, lmu_name")
        .eq("approved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const userIds = (profiles ?? []).map((p) => p.id);
      let discordMap: Record<string, { discord_username?: string | null; discord_server_nickname?: string | null }> = {};
      if (userIds.length > 0) {
        const { data: priv } = await (supabase as unknown as { from: (t: string) => any })
          .from("profiles_private")
          .select("user_id, discord_username, discord_server_nickname")
          .in("user_id", userIds);
        for (const row of (priv ?? []) as { user_id: string; discord_username?: string | null; discord_server_nickname?: string | null }[]) {
          discordMap[row.user_id] = { discord_username: row.discord_username, discord_server_nickname: row.discord_server_nickname };
        }
      }
      return ((profiles ?? []) as Profile[]).map((p) => ({
        ...p,
        discord_username: discordMap[p.id]?.discord_username ?? null,
        discord_server_nickname: discordMap[p.id]?.discord_server_nickname ?? null,
      }));
    },
  });

  const userIds = (data ?? []).map((p) => p.id);
  const { data: wrongNameStatus } = useQuery({
    queryKey: ["admin-msg-status", "wrong_name", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const rows = await fetchStatus({ data: { userIds, template: "wrong_name" } });
      const map: Record<string, string> = {};
      for (const r of rows) map[r.user_id] = r.sent_at;
      return map;
    },
  });

  const { data: guildStatus } = useQuery({
    queryKey: ["admin-guild-status", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const rows = await checkGuildFn({ data: { userIds } });
      const map: Record<string, "in_guild" | "not_member" | "not_linked" | "error"> = {};
      for (const r of rows) map[r.user_id] = r.status;
      return map;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const approveMut = useMutation({
    mutationFn: async (userId: string) => {
      await approveFn({ data: { targetUserId: userId, approved: true } });
      // Send approval notification on website + Discord (best-effort)
      await sendMessageFn({ data: { targetUserId: userId, template: "profile_approved" } });
    },
    onSuccess: () => {
      toast.success("Profil godkendt og besked sendt");
      qc.invalidateQueries({ queryKey: ["admin-pending-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const messageMut = useMutation({
    mutationFn: async (vars: { userId: string; template: "wrong_name" }) => {
      return await sendMessageFn({ data: { targetUserId: vars.userId, template: vars.template } });
    },
    onSuccess: (res) => {
      if (res?.discord?.ok) {
        toast.success("Besked sendt på hjemmesiden og Discord");
      } else if (res?.discord?.reason === "not_linked") {
        toast.success("Besked sendt på hjemmesiden (Discord ikke tilknyttet)");
      } else {
        toast.success("Besked sendt på hjemmesiden (Discord DM fejlede)");
      }
      qc.invalidateQueries({ queryKey: ["admin-msg-status", "wrong_name"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="outline" size="icon" aria-label="Tilbage til admin">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <UserCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Afventer godkendelse</h1>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Indlæser…</p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-muted-foreground">Ingen brugere afventer godkendelse.</p>
      ) : (
        <div className="space-y-2">
          {data!.map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 py-3">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-base">
                    {p.display_name || "(uden navn)"}
                  </CardTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {p.lmu_name && (
                      <Badge variant="secondary" className="text-xs">LMU: {p.lmu_name}</Badge>
                    )}
                    {p.discord_server_nickname && (
                      <Badge variant="secondary" className="text-xs">Discord (server): {p.discord_server_nickname}</Badge>
                    )}
                    {!p.discord_server_nickname && p.discord_username && (
                      <Badge variant="secondary" className="text-xs">Discord: {p.discord_username}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Tilmeldt {new Date(p.created_at).toLocaleDateString("da-DK")}
                    </span>
                    {wrongNameStatus?.[p.id] && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
                        <MessageSquareWarning className="h-3 w-3" />
                        Navne-besked sendt {formatRelativeDk(wrongNameStatus[p.id])}
                      </Badge>
                    )}
                    {guildStatus?.[p.id] === "in_guild" && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> På Discord-server
                      </Badge>
                    )}
                    {guildStatus?.[p.id] === "not_member" && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-red-500/50 text-red-600 dark:text-red-400">
                        <XCircle className="h-3 w-3" /> Ikke på Discord-server
                      </Badge>
                    )}
                    {guildStatus?.[p.id] === "not_linked" && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-muted-foreground/40 text-muted-foreground">
                        <HelpCircle className="h-3 w-3" /> Discord ikke tilknyttet
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => approveMut.mutate(p.id)}
                    disabled={approveMut.isPending}
                  >
                    <ThumbsUp className="h-4 w-4" /> Godkend
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Flere handlinger" disabled={messageMut.isPending}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          messageMut.mutate({ userId: p.id, template: "wrong_name" })
                        }
                      >
                        <MessageSquareWarning className="mr-2 h-4 w-4" />
                        {wrongNameStatus?.[p.id] ? "Send navne-besked igen" : "Fejl navn — bed om for- og efternavn"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
