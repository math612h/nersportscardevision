import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { adminListRoles, adminSetRole, type AppRole } from "@/lib/roles.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/roller")({
  component: AdminRolesPage,
});

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administratorer",
  steward: "Stewards",
  coach: "Coaches",
  racer: "Kørere",
  guest: "Gæster",
};

const ROLE_ORDER: AppRole[] = ["admin", "steward", "coach", "racer", "guest"];

function AdminRolesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const listFn = useServerFn(adminListRoles);
  const setFn = useServerFn(adminSetRole);

  const { data: groups = [] } = useQuery({ queryKey: ["admin-roles"], queryFn: () => listFn() });

  const { data: users = [] } = useQuery({
    queryKey: ["admin-role-search", search],
    queryFn: async () => {
      if (search.trim().length < 2) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${search.trim()}%`)
        .limit(20);
      return data ?? [];
    },
  });

  const setMut = useMutation({
    mutationFn: (v: { userId: string; role: AppRole; assign: boolean }) => setFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      toast.success("Roller opdateret");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rolesByUser = new Map<string, AppRole[]>();
  for (const g of groups as { role: AppRole; users: { id: string }[] }[]) {
    for (const u of g.users) {
      rolesByUser.set(u.id, [...(rolesByUser.get(u.id) ?? []), g.role]);
    }
  }

  const ordered = ROLE_ORDER.map((r) => (groups as any[]).find((g) => g.role === r)).filter(Boolean) as {
    role: AppRole;
    users: { id: string; display_name: string; avatar_url: string | null }[];
  }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Roller</h1>
        <p className="text-sm text-muted-foreground">Søg brugere og tildel roller. Stewards har kun adgang til protester.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Tildel roller</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Søg brugere…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {search.trim().length >= 2 && users.length === 0 && (
            <p className="text-sm text-muted-foreground">Ingen brugere fundet.</p>
          )}
          <div className="space-y-2">
            {users.map((u: any) => {
              const current = rolesByUser.get(u.id) ?? [];
              return (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-card px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                      <AvatarFallback>{u.display_name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <div className="text-sm font-medium">{u.display_name}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ROLE_ORDER.map((role) => {
                      const has = current.includes(role);
                      return (
                        <Button
                          key={role}
                          size="sm"
                          variant={has ? "default" : "outline"}
                          disabled={setMut.isPending}
                          onClick={() => setMut.mutate({ userId: u.id, role, assign: !has })}
                        >
                          {role}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {ordered.map((g) => (
          <Card key={g.role}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {ROLE_LABELS[g.role]}
                <Badge variant="secondary">{g.users.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.users.length === 0 && <p className="text-sm text-muted-foreground">Ingen brugere.</p>}
              {g.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar className="h-7 w-7">
                      {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                      <AvatarFallback>{u.display_name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm">{u.display_name}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={setMut.isPending}
                    onClick={() => setMut.mutate({ userId: u.id, role: g.role, assign: false })}
                  >
                    Fjern
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
