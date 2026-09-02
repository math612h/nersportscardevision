import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Gauge, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseLmuRaceFile } from "@/lib/lmu-parser";
import {
  buildPaceComparison,
  gapToStr,
  msToLapStr,
  type PaceFile,
  type PaceSource,
} from "@/lib/pace-comparison";

export const Route = createFileRoute("/_authenticated/_admin/admin/pace-sammenligning")({
  head: () => ({
    meta: [
      { title: "Pro/Am tempo-sammenligning — LMU Danmark" },
      { name: "description", content: "Sammenlign LMGT3-kørernes løbstempo på tværs af Pro- og Am-serverens racefiler." },
      { property: "og:title", content: "Pro/Am tempo-sammenligning — LMU Danmark" },
      { property: "og:description", content: "Sammenlign LMGT3-kørernes løbstempo på tværs af Pro- og Am-serverens racefiler." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaceComparisonPage,
});

const SOURCE_LABEL: Record<PaceSource, string> = { pro: "PRO-server", am: "AM-server" };

function FileSlot({
  source,
  file,
  onLoad,
  onClear,
}: {
  source: PaceSource;
  file: PaceFile | null;
  onLoad: (file: PaceFile) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async (f: File) => {
    try {
      const race = parseLmuRaceFile(await f.text());
      onLoad({ source, fileName: f.name, race });
      toast.success(`${SOURCE_LABEL[source]}: ${f.name} indlæst`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke læse filen");
    }
  };

  const gt3 = file?.race.drivers.filter((d) => (d.carClassNorm || "").toUpperCase() === "LMGT3").length ?? 0;

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{SOURCE_LABEL[source]}</span>
        {file && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {source === "pro" ? "Racefil med LMGT3 Pro og LMP2 (LMP2 ignoreres)." : "Racefil med LMGT3 Am."}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="mr-2 h-4 w-4" /> Vælg racefil
      </Button>
      {file && (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div className="font-mono">{file.fileName}</div>
          <div>
            {file.race.track}
            {file.race.layout ? ` · ${file.race.layout}` : ""} · {gt3} LMGT3-kørere
          </div>
        </div>
      )}
    </div>
  );
}

function PaceComparisonPage() {
  const [pro, setPro] = useState<PaceFile | null>(null);
  const [am, setAm] = useState<PaceFile | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const rows = useMemo(
    () => buildPaceComparison([pro, am].filter((f): f is PaceFile => f !== null)),
    [pro, am],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Gauge className="h-6 w-6 text-primary" /> Pro/Am tempo-sammenligning
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload racefilerne fra begge servere. Systemet viser LMGT3-kørernes median af alle gyldige omgange,
          så I selv kan vurdere om nogen bør flyttes mellem PRO og AM. Der foreslås ingen klasseændringer.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Racefiler</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <FileSlot source="pro" file={pro} onLoad={setPro} onClear={() => setPro(null)} />
          <FileSlot source="am" file={am} onLoad={setAm} onClear={() => setAm(null)} />
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Samlet resultatoversigt ({rows.length} kørere)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Kører</th>
                  <th className="px-3 py-2">Bilnr.</th>
                  <th className="px-3 py-2">Klasse</th>
                  <th className="px-3 py-2">Server / fil</th>
                  <th className="px-3 py-2 text-right">Hurtigste omgang</th>
                  <th className="px-3 py-2 text-right">Median (alle)</th>
                  <th className="px-3 py-2 text-right">Gyldige omgange</th>
                  <th className="px-3 py-2 text-right">Forskel</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = !!open[r.key];
                  return (
                    <Fragment key={r.key}>
                      <tr
                        className={`cursor-pointer border-b border-border/40 hover:bg-muted/40 ${r.insufficient ? "opacity-70" : ""}`}
                        onClick={() => setOpen((p) => ({ ...p, [r.key]: !p[r.key] }))}
                      >
                        <td className="px-3 py-2 text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-3 py-2 font-mono">{r.position ?? "—"}</td>
                        <td className="px-3 py-2 font-medium">
                          {r.name}
                          {r.insufficient && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                Ingen gyldige omgange
                              </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{r.carNumber ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={r.source === "pro" ? "default" : "secondary"}>
                            {r.source === "pro" ? "PRO" : "AM"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {SOURCE_LABEL[r.source]} · <span className="font-mono">{r.fileName}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {r.fastestLapMs != null ? msToLapStr(r.fastestLapMs) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {r.medianMs != null ? msToLapStr(r.medianMs) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{r.validLapCount}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {r.gapMs != null ? (r.gapMs === 0 ? "—" : gapToStr(r.gapMs)) : "—"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-border/40 bg-muted/20">
                          <td />
                          <td colSpan={9} className="px-3 py-3">
                            <div className="mb-2 text-xs text-muted-foreground">
                              {r.insufficient
                                ? "Ingen gyldige omgange — ingen median beregnet."
                                : "Alle gyldige omgange, som medianen er beregnet ud fra:"}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {r.topLaps.map((l, i) => (
                                <span
                                  key={`${l.num}-${i}`}
                                  className="rounded border border-border/60 px-2 py-1 font-mono text-xs"
                                >
                                  {i + 1}. {msToLapStr(l.ms)}
                                  {l.num != null && <span className="ml-1 text-muted-foreground">(omg. {l.num})</span>}
                                </span>
                              ))}
                              {r.topLaps.length === 0 && <span className="text-xs">Ingen gyldige omgange.</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
