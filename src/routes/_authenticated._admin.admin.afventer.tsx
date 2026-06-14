import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserCheck, ThumbsUp, MoreVertical, MessageSquareWarning } from "lucide-react";
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

type Profile = { id: string; display_name: string | null; created_at: string; lmu_name: string | null };

function PendingApprovalsPage() {
  const qc = useQueryClient();
  const approveFn = useServerFn(setProfileApproval);
  const sendMessageFn = useServerFn(sendAdminTemplateMessage);
  const fetchStatus = useServerFn(getAdminMessageStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-pending-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, created_at, lmu_name")
        .eq("approved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Profile[];
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
                    <span className="text-xs text-muted-foreground">
                      Tilmeldt {new Date(p.created_at).toLocaleDateString("da-DK")}
                    </span>
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
                        Fejl navn — bed om for- og efternavn
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
