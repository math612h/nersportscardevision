import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { adminListCoaches, adminSetCoachRole } from "@/lib/coaching.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/coaches")({
  component: AdminCoachesPage,
});

function AdminCoachesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const listFn = useServerFn(adminListCoaches);
  const setFn = useServerFn(adminSetCoachRole);

  const { data: coaches = [] } = useQuery({ queryKey: ["admin-coaches"], queryFn: () => listFn() });

  const { data: users = [] } = useQuery({
    queryKey: ["admin-coach-search", search],
    queryFn: async () => {
      if (search.trim().length < 2) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${search}%`)
        .limit(20);
      return data ?? [];
    },
  });

  const setMut = useMutation({
    mutationFn: (v: { user_id: string; is_coach: boolean }) => setFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-coaches"] });
      qc.invalidateQueries({ queryKey: ["coaches"] });
      toast.success("Opdateret");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const coachIds = new Set((coaches as any[]).map((c) => c.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coaches</h1>
        <p className="text-sm text-muted-foreground">Tildel eller fjern coach-rollen.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Headphones className="h-4 w-4" /> Aktuelle coaches</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(coaches as any[]).length === 0 && <p className="text-sm text-muted-foreground">Ingen coaches endnu.</p>}
          {(coaches as any[]).map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                  <AvatarFallback>{c.display_name?.[0] ?? "?"}</AvatarFallback>
                </Avatar>
                <div className="font-medium">{c.display_name}</div>
                <Badge variant="secondary">coach</Badge>
              </div>
              <Button size="sm" variant="outline" onClick={() => setMut.mutate({ user_id: c.id, is_coach: false })}>
                Fjern coach
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tildel coach-rollen</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Søg brugere…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1">
            {users.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between rounded border border-border bg-card px-3 py-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                    <AvatarFallback>{u.display_name?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                  <div className="text-sm">{u.display_name}</div>
                </div>
                {coachIds.has(u.id) ? (
                  <Badge variant="secondary">Allerede coach</Badge>
                ) : (
                  <Button size="sm" onClick={() => setMut.mutate({ user_id: u.id, is_coach: true })}>
                    Gør til coach
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
