import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_admin/admin/protests/")({
  component: AdminProtests,
});

function AdminProtests() {
  const { data } = useQuery({
    queryKey: ["protests-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protests")
        .select("*, divisions(name, leagues(name)), protest_involved(id,response)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tilbage til admin
      </Link>
      <h1 className="text-2xl font-bold">Alle protester</h1>
      {data?.length === 0 && <p className="text-muted-foreground">Ingen protester.</p>}
      <div className="space-y-3">
        {data?.map((p: any) => {
          const total = p.protest_involved?.length ?? 0;
          const answered = (p.protest_involved ?? []).filter((r: any) => r.response).length;
          return (
            <Link key={p.id} to="/admin/protests/$protestId" params={{ protestId: p.id }}>
              <Card className="cursor-pointer transition hover:border-primary">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{p.divisions?.leagues?.name} · {p.divisions?.name}</CardTitle>
                      <CardDescription>{format(new Date(p.created_at), "dd MMM yyyy HH:mm")}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.lap_number != null && <Badge variant="outline">Omg. {p.lap_number}</Badge>}
                      {p.corner && <Badge variant="outline">{p.corner}</Badge>}
                      {p.status === "ruled"
                        ? <Badge>Afgjort</Badge>
                        : <Badge variant="secondary">Åben · {answered}/{total} svar</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {p.involved_drivers && <p><span className="text-muted-foreground">Indklaget:</span> {p.involved_drivers}</p>}
                  <p className="line-clamp-2 whitespace-pre-wrap">{p.description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
