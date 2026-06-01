import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_admin/admin/ligaer/$leagueId/entries")({
  component: AdminEntries,
});

function AdminEntries() {
  const { leagueId } = useParams({ from: "/_authenticated/_admin/admin/ligaer/$leagueId/entries" });
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["entries-admin", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("*, divisions!inner(name, league_id)")
        .eq("divisions.league_id", leagueId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("entries").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Fjernet"); qc.invalidateQueries({ queryKey: ["entries-admin", leagueId] }); },
  });

  // Group by division → class → category
  const grouped = (data ?? []).reduce<Record<string, Record<string, Record<string, any[]>>>>((acc, e: any) => {
    const div = e.divisions?.name ?? "Ukendt";
    acc[div] ??= {};
    acc[div][e.car_class] ??= {};
    acc[div][e.car_class][e.driver_category] ??= [];
    acc[div][e.car_class][e.driver_category].push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Link to="/admin/ligaer" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-3 w-3" /> Ligaer</Link>
      <h1 className="text-2xl font-bold">Entries</h1>
      {Object.keys(grouped).length === 0 && <p className="text-muted-foreground">Ingen tilmeldinger endnu.</p>}
      {Object.entries(grouped).map(([div, classes]) => (
        <Card key={div}>
          <CardHeader><CardTitle className="text-base">{div}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(classes).map(([cls, cats]) => (
              <div key={cls}>
                <p className="text-sm font-medium">{cls}</p>
                {Object.entries(cats).map(([cat, list]) => (
                  <div key={cat} className="ml-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{cat}</p>
                    <ul className="space-y-1">
                      {list.map((e) => (
                        <li key={e.id} className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-sm">
                          <span>{e.driver_name}</span>
                          <Button variant="ghost" size="sm" onClick={() => del.mutate(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
