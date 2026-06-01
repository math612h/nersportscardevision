import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/mine-protests")({
  component: MyProtests,
});

function MyProtests() {
  const { isAdmin } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-protests", isAdmin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protests")
        .select("*, divisions(name, leagues(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{isAdmin ? "Alle protests" : "Mine protests"}</h1>
        <p className="text-sm text-muted-foreground">{isAdmin ? "Oversigt over alle indsendte protests." : "Protests du har indsendt."}</p>
      </div>
      {data?.length === 0 && <p className="text-muted-foreground">Ingen protests.</p>}
      <div className="space-y-3">
        {data?.map((p: any) => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{p.divisions?.leagues?.name} · {p.divisions?.name}</CardTitle>
                  <CardDescription>{format(new Date(p.created_at), "dd MMM yyyy HH:mm")}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.lap_number != null && <Badge variant="outline">Omg. {p.lap_number}</Badge>}
                  {p.corner && <Badge variant="outline">{p.corner}</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.involved_drivers && <p><span className="text-muted-foreground">Involveret:</span> {p.involved_drivers}</p>}
              <p className="whitespace-pre-wrap">{p.description}</p>
              {p.video_url && <a href={p.video_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Video</a>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
