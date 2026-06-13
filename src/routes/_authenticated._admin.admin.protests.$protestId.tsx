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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { notifyProtestRuling } from "@/lib/protest-ruling-notify.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/protests/$protestId")({
  component: AdminProtestDetail,
});

const OUTCOMES = [
  { value: "no_penalty", label: "Ingen straf" },
  { value: "warning", label: "Advarsel" },
  { value: "time_penalty", label: "Tidsstraf" },
  { value: "point_penalty", label: "Pointstraf" },
  { value: "disqualified", label: "Diskvalifikation" },
] as const;

const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const pointsFor = (pos: number) => (pos >= 1 && pos <= POINTS_TABLE.length ? POINTS_TABLE[pos - 1] : 0);

type AppliedMap = Record<string, { seconds?: number; points?: number }>;

function AdminProtestDetail() {
  const { protestId } = useParams({ from: "/_authenticated/_admin/admin/protests/$protestId" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const notifyRuling = useServerFn(notifyProtestRuling);

  const { data: p } = useQuery({
    queryKey: ["admin-protest", protestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protests")
        .select("*, divisions(id, name, settings, league_id, leagues(id, name)), protest_involved(*)")
        .eq("id", protestId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: submitter } = useQuery({
    enabled: !!p?.submitted_by,
    queryKey: ["protest-submitter", p?.submitted_by],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", p!.submitted_by)
        .maybeSingle();
      return data;
    },
  });

  const leagueId = (p as any)?.divisions?.league_id ?? null;
  const { data: entries } = useQuery({
    enabled: !!leagueId,
    queryKey: ["protest-entries", leagueId],
    queryFn: async () => {
      const { data } = await supabase
        .from("entries")
        .select("user_id, car_class, driver_category, car_number")
        .eq("league_id", leagueId);
      return data ?? [];
    },
  });

  const [outcome, setOutcome] = useState<string>("");
  const [reason, setReason] = useState("");
  const [seconds, setSeconds] = useState("");
  const [points, setPoints] = useState("");
  const [penalized, setPenalized] = useState<string[]>([]);

  useEffect(() => {
    if (!p) return;
    setOutcome(p.verdict_outcome ?? "");
    setReason(p.verdict_reason ?? "");
    const d = (p.verdict_details ?? {}) as any;
    setSeconds(d.seconds != null ? String(d.seconds) : "");
    setPoints(d.points != null ? String(d.points) : "");
    setPenalized(Array.isArray(d.penalized_user_ids) ? d.penalized_user_ids : []);
  }, [p]);

  const togglePenalized = (uid: string) =>
    setPenalized((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));

  const rule = useMutation({
    mutationFn: async () => {
      if (!outcome) throw new Error("Vælg et udfald");
      if (!reason.trim()) throw new Error("Begrundelse er påkrævet");

      const needsTargets = ["warning", "time_penalty", "point_penalty", "disqualified"].includes(outcome);
      if (needsTargets && penalized.length === 0) {
        throw new Error("Vælg hvilken/hvilke kører(e) der modtager straffen");
      }

      let secondsNum = 0;
      let pointsNum = 0;
      if (outcome === "time_penalty") {
        secondsNum = Number(seconds);
        if (!secondsNum || secondsNum <= 0) throw new Error("Angiv antal sekunder");
      }
      if (outcome === "point_penalty") {
        pointsNum = Number(points);
        if (!pointsNum || pointsNum <= 0) throw new Error("Angiv antal point");
      }

      // Compute delta vs previously applied penalties to avoid double-counting on re-ruling
      const prevDetails = (p?.verdict_details ?? {}) as any;
      const prevApplied: AppliedMap = (prevDetails.applied_penalties ?? {}) as AppliedMap;

      const newApplied: AppliedMap = {};
      if (outcome === "time_penalty") {
        for (const uid of penalized) newApplied[uid] = { seconds: secondsNum };
      } else if (outcome === "point_penalty") {
        for (const uid of penalized) newApplied[uid] = { points: pointsNum };
      }

      // Apply delta to division.settings.results
      const division = (p as any)?.divisions;
      if (division) {
        const settings = (division.settings ?? {}) as any;
        const results: any[] = Array.isArray(settings.results) ? [...settings.results] : [];
        const flPts = Number(settings.fastest_lap_points ?? 1);

        const userIds = new Set<string>([...Object.keys(prevApplied), ...Object.keys(newApplied)]);
        let changed = false;
        for (const uid of userIds) {
          const oldP = prevApplied[uid] ?? {};
          const newP = newApplied[uid] ?? {};
          const dSec = (newP.seconds ?? 0) - (oldP.seconds ?? 0);
          const dPts = (newP.points ?? 0) - (oldP.points ?? 0);
          if (dSec === 0 && dPts === 0) continue;
          for (const r of results) {
            if (r.user_id !== uid) continue;
            if (dSec !== 0) {
              r.penalty_seconds = Math.max(0, Number(r.penalty_seconds ?? 0) + dSec);
              if (typeof r.finish_time_ms === "number" && r.finish_time_ms > 0 && !r.dnf && !r.dns) {
                r.effective_ms = r.finish_time_ms + Math.max(0, r.penalty_seconds) * 1000;
              }
            }
            if (dPts !== 0) {
              r.penalty_points = Math.max(0, Number(r.penalty_points ?? 0) + dPts);
            }
            changed = true;
          }
        }

        if (changed) {
          // Recompute class_position + points per class group
          const groups = new Map<string, any[]>();
          for (const r of results) {
            const k = `${r.car_class}|${r.driver_category}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k)!.push(r);
          }
          for (const list of groups.values()) {
            const finished = list.filter((r) => !r.dnf && !r.dns && typeof r.effective_ms === "number" && r.effective_ms > 0);
            const nonFinished = list.filter((r) => !finished.includes(r));
            finished.sort((a, b) => a.effective_ms - b.effective_ms);
            finished.forEach((r, idx) => {
              r.class_position = idx + 1;
              const base = pointsFor(r.class_position) + (r.fastest_lap ? flPts : 0);
              r.points = Math.max(0, base - Math.max(0, Number(r.penalty_points ?? 0)));
            });
            for (const r of nonFinished) {
              r.class_position = 0;
              r.points = 0;
            }
          }

          const newSettings = { ...settings, results };
          const { error: upErr } = await supabase
            .from("divisions")
            .update({ settings: newSettings })
            .eq("id", division.id);
          if (upErr) throw upErr;
        }
      }

      const details: any = { penalized_user_ids: penalized, applied_penalties: newApplied };
      if (outcome === "time_penalty") details.seconds = secondsNum;
      if (outcome === "point_penalty") details.points = pointsNum;

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
    onSuccess: async () => {
      toast.success("Afgørelse sendt");
      qc.invalidateQueries({ queryKey: ["admin-protest", protestId] });
      qc.invalidateQueries({ queryKey: ["protests-admin"] });
      qc.invalidateQueries({ queryKey: ["league-results"] });
      qc.invalidateQueries({ queryKey: ["divisions-admin"] });
      try {
        await notifyRuling({ data: { protestId } });
      } catch (e: any) {
        toast.error(`Kunne ikke sende beskeder: ${e.message ?? e}`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!p) return <p className="text-sm text-muted-foreground">Indlæser…</p>;

  const involved = p.protest_involved ?? [];
  const answered = involved.filter((r: any) => r.response).length;
  const ruled = p.status === "ruled";
  const needsTargets = ["warning", "time_penalty", "point_penalty", "disqualified"].includes(outcome);

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
          <CardDescription>Sendes til klager og alle indklagede. Tids- og pointstraf trækkes automatisk fra i stillingen.</CardDescription>
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
          {outcome === "point_penalty" && (
            <div>
              <Label>Antal point</Label>
              <Input type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} />
            </div>
          )}

          {needsTargets && (() => {
            const targets: { user_id: string; driver_name: string; isSubmitter?: boolean }[] = [];
            if (p.submitted_by) {
              targets.push({
                user_id: p.submitted_by,
                driver_name: submitter?.display_name ?? "Klager",
                isSubmitter: true,
              });
            }
            for (const r of involved) {
              if (!targets.some((t) => t.user_id === r.user_id)) {
                targets.push({ user_id: r.user_id, driver_name: r.driver_name });
              }
            }
            return (
              <div className="space-y-2">
                <Label>Hvem modtager straffen?</Label>
                {targets.length === 0 && (
                  <p className="text-xs text-muted-foreground">Ingen tilgængelige.</p>
                )}
                <div className="space-y-1.5 rounded-md border border-border p-3">
                  {targets.map((t) => {
                    const e = (entries ?? []).find((x: any) => x.user_id === t.user_id) as any;
                    const meta = e
                      ? [e.driver_category, e.car_class, e.car_number != null ? `#${e.car_number}` : null]
                          .filter(Boolean)
                          .join(" · ")
                      : null;
                    return (
                      <label key={t.user_id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={penalized.includes(t.user_id)}
                          onCheckedChange={() => togglePenalized(t.user_id)}
                        />
                        <span>{t.driver_name}</span>
                        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
                        {t.isSubmitter && <Badge variant="outline" className="text-[10px]">Klager</Badge>}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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
