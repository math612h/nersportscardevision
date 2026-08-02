import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { msToLapStr } from "@/lib/lmu-parser";
import { recomputeResultFile, type RepairReport } from "@/lib/leaderboard-repair.functions";

/**
 * Admin-værktøj: genberegn leaderboard-poster fra én konkret resultatfil.
 * Rører kun poster med præcis samme tidsstempel + bane/layout som filen.
 */
export function ResultFileRepairCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [report, setReport] = useState<RepairReport | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useServerFn(recomputeResultFile);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setXml(text);
    setFileName(file.name);
    setReport(null);
  };

  const execute = async (apply: boolean) => {
    if (!xml) return;
    setBusy(true);
    try {
      const res = await run({ data: { xml, apply } });
      setReport(res);
      toast.success(apply ? "Genberegning gennemført" : "Forhåndsvisning klar");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke genberegne filen");
    } finally {
      setBusy(false);
    }
  };

  const changed = report?.changes.filter((c) => c.action !== "unchanged") ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2 text-primary">
          <Wrench className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">Genberegn resultatfil (admin)</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload den oprindelige XML-resultatfil. Kun poster med præcis samme tidsstempel og bane/layout som filen bliver
          rettet — alle øvrige tider bevares. Se altid forhåndsvisningen først.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xml"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Vælg XML-fil</Button>
          {fileName && <span className="text-[11px] text-muted-foreground">{fileName}</span>}
          <Button size="sm" disabled={!xml || busy} onClick={() => void execute(false)}>Forhåndsvis</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!report || report.applied || changed.length === 0 || busy}
            onClick={() => void execute(true)}
          >
            Anvend rettelser
          </Button>
        </div>

        {report && (
          <div className="space-y-2 rounded-md border border-border/60 p-3 text-xs">
            <div className="text-muted-foreground">
              {report.file.track}
              {report.file.layout ? ` · ${report.file.layout}` : ""} · {new Date(report.file.recordedAt).toLocaleString("da-DK")} ·{" "}
              {report.scopedRows} post(er) koblet til filen · {report.applied ? "ANVENDT" : "forhåndsvisning"}
            </div>
            {changed.length === 0 ? (
              <div>Ingen ændringer nødvendige.</div>
            ) : (
              <ul className="space-y-1">
                {changed.map((c, i) => (
                  <li key={i} className="font-mono">
                    <span className="uppercase text-primary">{c.action}</span>{" "}
                    {c.before ? `${c.before.driverName} ${msToLapStr(c.before.bestLapMs)}` : "—"}
                    {" → "}
                    {c.after ? `${c.after.driverName} ${msToLapStr(c.after.bestLapMs)}${c.after.lapNum != null ? ` (omg. ${c.after.lapNum})` : ""}` : "slettet"}
                    <span className="ml-2 font-sans text-muted-foreground">{c.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
