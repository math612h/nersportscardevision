import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Play } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listCronJobs, listCronRuns, listCronTriggers, runCronJob } from "@/lib/cron.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/cron")({
  component: CronPage,
});

function CronPage() {
  const qc = useQueryClient();
  const fetchJobs = useServerFn(listCronJobs);
  const fetchRuns = useServerFn(listCronRuns);
  const fetchTriggers = useServerFn(listCronTriggers);
  const trigger = useServerFn(runCronJob);
  const [running, setRunning] = useState<string | null>(null);

  const { data: jobs = [] } = useQuery({ queryKey: ["cron-jobs"], queryFn: () => fetchJobs() });
  const { data: runs = [] } = useQuery({ queryKey: ["cron-runs"], queryFn: () => fetchRuns({ data: { limit: 50 } }) });
  const { data: triggers = [] } = useQuery({ queryKey: ["cron-triggers"], queryFn: () => fetchTriggers() });

  const handleRun = async (key: string, label: string) => {
    if (!confirm(`Kør "${label}" nu?`)) return;
    setRunning(key);
    try {
      const res = await trigger({ data: { key } });
      toast.success(`${label} kørt (HTTP ${res.status}).`);
      qc.invalidateQueries({ queryKey: ["cron-runs"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Cron-jobs</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Kør et job nu</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(triggers as any[]).map((t) => (
            <Button key={t.key} variant="outline" size="sm" disabled={running === t.key}
              onClick={() => handleRun(t.key, t.label)}>
              <Play className="h-3 w-3 mr-1" />
              {running === t.key ? "Kører…" : t.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Skedulerede jobs ({jobs.length})</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {(jobs as any[]).map((j) => (
            <div key={j.jobid} className="flex flex-wrap items-center gap-2 rounded border border-border/60 px-2 py-1.5">
              <Badge variant={j.active ? "default" : "secondary"}>{j.active ? "aktiv" : "pauset"}</Badge>
              <span className="font-mono text-xs">{j.jobname ?? `#${j.jobid}`}</span>
              <span className="font-mono text-xs text-muted-foreground">{j.schedule}</span>
              <span className="ml-auto truncate max-w-[300px] text-[10px] text-muted-foreground">{j.command}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Seneste kørsler</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {(runs as any[]).map((r, i) => {
            const ok = r.status === "succeeded";
            const ms = r.end_time && r.start_time ? new Date(r.end_time).getTime() - new Date(r.start_time).getTime() : null;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-border/60 px-2 py-1.5">
                <Badge variant={ok ? "default" : "destructive"}>{r.status}</Badge>
                <span className="font-mono text-xs">{r.jobname ?? `#${r.jobid}`}</span>
                {ms != null && <span className="text-xs text-muted-foreground">{ms}ms</span>}
                <span className="ml-auto text-xs text-muted-foreground">{new Date(r.start_time).toLocaleString("da-DK")}</span>
                {!ok && r.return_message && (
                  <span className="w-full truncate text-[10px] text-destructive">{r.return_message}</span>
                )}
              </div>
            );
          })}
          {runs.length === 0 && <p className="text-muted-foreground">Ingen kørsler endnu.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
