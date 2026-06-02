import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/_admin/admin/protests/$protestId")({
  component: AdminProtestDetail,
});

const OUTCOMES = [
  { value: "no_penalty", label: "Ingen straf" },
  { value: "warning", label: "Advarsel" },
  { value: "time_penalty", label: "Tidsstraf" },
  { value: "position_penalty", label: "Placeringsstraf" },
  { value: "disqualified", label: "Diskvalifikation" },
] as const;

function AdminProtestDetail() {
  const { protestId } = useParams({ from: "/_authenticated/_admin/admin/protests/$protestId" });
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: p } = useQuery({
    queryKey: ["admin-protest", protestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protests")
        .select("*, divisions(name, leagues(name)), protest_involved(*)")
        .eq("id", protestId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [outcome, setOutcome] = useState<string>("");
  const [reason, setReason] = useState("");
  const [seconds, setSeconds] = useState("");
  const [positions, setPositions] = useState("");

  useEffect(() => {
    if (!p) return;
    setOutcome(p.verdict_outcome ?? "");
    setReason(p.verdict_reason ?? "");
    const d = (p.verdict_details ?? {}) as any;
    setSeconds(d.seconds != null ? String(d.seconds) : "");
    setPositions(d.positions != null ? String(d.positions) : "");
  }, [p]);

  const rule = useMutation({
    mutationFn: async () => {
      if (!outcome) throw new Error("Vælg et udfald");
      if (!reason.trim()) throw new Error("Begrundelse er påkrævet");
      const details: Record<string, number> = {};
      if (outcome === "time_penalty") {
        const n = Number(seconds);
        if (!n || n <= 0) throw new Error("Angiv antal sekunder");
        details.seconds = n;
      }
      if (outcome === "position_penalty") {
        const n = Number(positions);
        if (!n || n <= 0) throw new Error("Angiv antal placeringer");
        details.positions = n;
      }
      const { error } = await supabase
        .from("protests")
        .update({
          status: "ruled",
          verdict_outcome: outcome as any,
          verdict_reason: reason.trim(),
          verdict_details: details,
          ruled_by: user!.id,
          ruled_at: new Date().toISOString(),
        })
        .eq("id", protestId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Afgørelse sendt");
      qc.invalidateQueries({ queryKey: ["admin-protest", protestId] });
      qc.invalidateQueries({ queryKey: ["protests-admin"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!p) return <p className="text-sm text-muted-foreground">Indlæser…</p>;

  const involved = p.protest_involved ?? [];
  const answered = involved.filter((r: any) => r.response).length;
  const ruled = p.status === "ruled";

  return (
    <div className="space-y-4">
      <Link to="/admin/protests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Tilbage til oversigt
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{p.divisions?.leagues?.name} · {p.divisions?.name}</CardTitle>
              <CardDescription>Indsendt {format(new Date(p.created_at), "dd MMM yyyy HH:mm")}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-1">
              {p.lap_number != null && <Badge variant="outline">Omg. {p.lap_number}</Badge>}
              {p.corner && <Badge variant="outline">{p.corner}</Badge>}
              {ruled
                ? <Badge>Afgjort</Badge>
                : <Badge variant="secondary">Åben · {answered}/{involved.length} svar</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {p.involved_drivers && <p><span className="text-muted-foreground">Indklaget:</span> {p.involved_drivers}</p>}
          <div>
            <p className="font-semibold">Klagers beskrivelse</p>
            <p className="whitespace-pre-wrap">{p.description}</p>
          </div>
          {p.video_url && <a href={p.video_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Video</a>}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Svar fra indklagede ({answered}/{involved.length})</h2>
        {involved.length === 0 && <p className="text-sm text-muted-foreground">Ingen indklagede koblet.</p>}
        {involved.map((r: any) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{r.driver_name}</CardTitle>
              {r.responded_at && <CardDescription>Svarede {format(new Date(r.responded_at), "dd MMM yyyy HH:mm")}</CardDescription>}
            </CardHeader>
            <CardContent className="pt-0 text-sm">
              {r.response
                ? <p className="whitespace-pre-wrap">{r.response}</p>
                : <p className="italic text-muted-foreground">Har endnu ikke svaret</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ruled ? "Opdater afgørelse" : "Afgør sagen"}</CardTitle>
          <CardDescription>Sendes til klager og alle indklagede.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Udfald</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue placeholder="Vælg udfald" /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {outcome === "time_penalty" && (
            <div>
              <Label>Sekunder</Label>
              <Input type="number" min={1} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
            </div>
          )}
          {outcome === "position_penalty" && (
            <div>
              <Label>Antal placeringer</Label>
              <Input type="number" min={1} value={positions} onChange={(e) => setPositions(e.target.value)} />
            </div>
          )}

          <div>
            <Label>Begrundelse</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={2000} />
          </div>

          <Button onClick={() => rule.mutate()} disabled={rule.isPending}>
            {ruled ? "Opdater afgørelse" : "Send afgørelse"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
