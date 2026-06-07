import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Gauge } from "lucide-react";

type Props = {
  score: number | null | undefined;
  percentile?: number | null;
  confidence?: number | null;
  carClass?: string;
  size?: "sm" | "xs";
  showLabel?: boolean;
};

type Tier = { label: string; cls: string };

function tierFor(percentile: number | null | undefined): Tier {
  // Tæller fra toppen: top 5% → blå, top 25% → guld, top 50% → sølv, ellers bronze
  const p = percentile ?? null;
  if (p == null) {
    return { label: "Ingen tier endnu", cls: "border-muted-foreground/40 text-muted-foreground" };
  }
  if (p >= 95) return { label: "Top 5% · Blå", cls: "border-sky-500/60 text-sky-700 dark:text-sky-400 bg-sky-500/5" };
  if (p >= 75) return { label: "Top 25% · Guld", cls: "border-amber-500/60 text-amber-700 dark:text-amber-400 bg-amber-500/5" };
  if (p >= 50) return { label: "Top 50% · Sølv", cls: "border-slate-400/60 text-slate-700 dark:text-slate-300 bg-slate-400/5" };
  return { label: "Bronze", cls: "border-orange-700/60 text-orange-800 dark:text-orange-400 bg-orange-700/5" };
}

export function RatingBadge({ score, percentile, confidence, carClass, size = "sm", showLabel = false }: Props) {
  if (score == null) return null;
  const rounded = Math.round(score);
  const tier = tierFor(percentile);
  const conf = confidence ?? 1;
  const cls = size === "xs" ? "text-[10px] px-1.5 py-0 h-5" : "text-xs";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 ${tier.cls} ${cls} shrink-0 cursor-help`}>
            <Gauge className="h-3 w-3" />
            {showLabel ? "ELO " : ""}{rounded}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-0.5">
            <div><strong>ELO: {rounded}</strong>{carClass ? ` · ${carClass}` : ""}</div>
            <div>{tier.label}{percentile != null ? ` (${Math.round(percentile)}. percentil)` : ""}</div>
            <div className="text-muted-foreground">Klassisk ELO-formel · K=32 (&lt;30 løb) / K=16 · alle starter på 1500</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
