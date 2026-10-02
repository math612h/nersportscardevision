import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_admin/admin/teams")({
  head: () => ({ meta: [{ title: "Teams — Kontrolpanel" }] }),
  component: AdminTeamsPage,
});

function AdminTeamsPage() {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["admin-teams"],
    queryFn: async () => {
      const sb = supabase as any;
      const [{ data: teams }, { data: members }, { data: entries }] = await Promise.all([
        sb.from("teams").select("id, name, owner_id").order("name"),
        sb.from("team_members").select("team_id, user_id"),
        sb.from("league_team_entries").select("team_id, car_class, status, leagues:league_id(name)").neq("status", "withdrawn"),
      ]);
      const ownerIds = Array.from(new Set(((teams ?? []) as any[]).map((t) => t.owner_id)));
      const { data: profs } = ownerIds.length
        ? await sb.from("profiles").select("id, display_name").in("id", ownerIds)
        : { data: [] };
      const names = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.display_name]));
      return ((teams ?? []) as any[]).map((t) => ({
        ...t,
        ownerName: names.get(t.owner_id) ?? "Ukendt",
        memberCount: ((members ?? []) as any[]).filter((m) => m.team_id === t.id).length,
        entries: ((entries ?? []) as any[]).filter((e) => e.team_id === t.id),
      }));
    },
  });
  const list = useMemo(
    () => (data ?? []).filter((t) => `${t.name} ${t.ownerName}`.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );
  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle>Teams</CardTitle>
        <p className="text-sm text-muted-foreground">
          Åbn et team for at redigere medlemmer, lineups, tilmeldinger og ejerskab som administrator.
        </p>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Søg team eller ejer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {list.map((t) => (
            <li key={t.id}>
              <Link to="/teams/$teamId" params={{ teamId: t.id }} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-muted/40">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">Ejer: {t.ownerName} · {t.memberCount} medlemmer</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.entries.map((e: any, i: number) => (
                    <Badge key={i} variant={e.status === "confirmed" ? "default" : "secondary"} className="text-[10px]">
                      {e.leagues?.name ?? "Liga"} · {e.car_class}
                    </Badge>
                  ))}
                </div>
              </Link>
            </li>
          ))}
          {list.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Ingen teams fundet.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
