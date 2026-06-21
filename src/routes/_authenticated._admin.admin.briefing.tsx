import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Headphones, X, Hand } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listBriefingRooms,
  listBriefingParticipants,
  closeBriefingRoom,
  clearRaisedHands,
} from "@/lib/briefing-admin.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/briefing")({
  component: BriefingAdmin,
});

function BriefingAdmin() {
  const qc = useQueryClient();
  const fetchRooms = useServerFn(listBriefingRooms);
  const fetchPs = useServerFn(listBriefingParticipants);
  const closeRoom = useServerFn(closeBriefingRoom);
  const clearHands = useServerFn(clearRaisedHands);

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["briefing-rooms"],
    queryFn: () => fetchRooms(),
    refetchInterval: 10_000,
  });

  const [expandedDiv, setExpandedDiv] = useState<string | null>(null);

  const handleClose = async (divisionId: string, name: string) => {
    if (!confirm(`Luk briefing for "${name}" og smid alle ud?`)) return;
    try {
      await closeRoom({ data: { divisionId } });
      toast.success("Briefing lukket.");
      qc.invalidateQueries({ queryKey: ["briefing-rooms"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const handleClearHands = async (divisionId: string) => {
    try {
      await clearHands({ data: { divisionId } });
      toast.success("Hænder sænket.");
      qc.invalidateQueries({ queryKey: ["briefing-rooms"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Headphones className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Briefing-rum</h1>
      </div>

      {isLoading && <p className="text-muted-foreground">Indlæser…</p>}
      {!isLoading && rooms.length === 0 && (
        <p className="text-muted-foreground text-sm">Ingen aktive briefing-rum.</p>
      )}

      {(rooms as any[]).map((r) => (
        <Card key={r.room}>
          <CardHeader>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <CardTitle className="text-base">
                  {r.leagueName} · {r.divisionName}
                </CardTitle>
                <p className="text-xs text-muted-foreground font-mono">{r.room}</p>
              </div>
              <Badge variant="secondary">{r.participants} i rummet</Badge>
              {r.raisedHands > 0 && (
                <Badge variant="default" className="gap-1"><Hand className="h-3 w-3" />{r.raisedHands}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline"
              onClick={() => setExpandedDiv(expandedDiv === r.divisionId ? null : r.divisionId)}>
              {expandedDiv === r.divisionId ? "Skjul deltagere" : "Vis deltagere"}
            </Button>
            {r.raisedHands > 0 && (
              <Button size="sm" variant="outline" onClick={() => handleClearHands(r.divisionId)}>
                Sænk alle hænder
              </Button>
            )}
            <Button size="sm" variant="destructive"
              onClick={() => handleClose(r.divisionId, r.divisionName)}>
              <X className="h-3 w-3 mr-1" />Luk rum
            </Button>
            {expandedDiv === r.divisionId && <ParticipantList divisionId={r.divisionId} fetchPs={fetchPs} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ParticipantList({ divisionId, fetchPs }: { divisionId: string; fetchPs: ReturnType<typeof useServerFn<typeof listBriefingParticipants>> }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["briefing-ps", divisionId],
    queryFn: () => fetchPs({ data: { divisionId } }),
    refetchInterval: 5_000,
  });
  if (isLoading) return <p className="w-full text-xs text-muted-foreground">Henter…</p>;
  return (
    <div className="w-full space-y-1 text-sm">
      {(data as any[]).map((p) => (
        <div key={p.identity} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
          <span className="flex-1 truncate">{p.name || p.identity}</span>
          {p.canPublish && <Badge variant="default" className="text-[10px]">mic</Badge>}
          <span className="text-[10px] text-muted-foreground">{p.tracksPublished} tracks</span>
        </div>
      ))}
      {data.length === 0 && <p className="text-xs text-muted-foreground">Tom.</p>}
    </div>
  );
}
