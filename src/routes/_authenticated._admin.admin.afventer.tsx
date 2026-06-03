import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserCheck, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { setProfileApproval } from "@/lib/leagues.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/afventer")({
  component: PendingApprovalsPage,
});

type Profile = { id: string; display_name: string | null; created_at: string; lmu_name: string | null };

function PendingApprovalsPage() {
  const qc = useQueryClient();
  const approveFn = useServerFn(setProfileApproval);

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

  const approveMut = useMutation({
    mutationFn: async (userId: string) => {
      await approveFn({ data: { targetUserId: userId, approved: true } });
    },
    onSuccess: () => {
      toast.success("Profil godkendt");
      qc.invalidateQueries({ queryKey: ["admin-pending-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
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
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => approveMut.mutate(p.id)}
                  disabled={approveMut.isPending}
                >
                  <ThumbsUp className="h-4 w-4" /> Godkend
                </Button>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
