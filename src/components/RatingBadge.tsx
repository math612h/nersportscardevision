import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Gauge } from "lucide-react";

type Props = {
  score: number | null | undefined;
  confidence?: number | null;
  carClass?: string;
  size?: "sm" | "xs";
  showLabel?: boolean;
};

function ratingColor(score: number) {
  if (score >= 75) return "border-emerald-500/50 text-emerald-700 dark:text-emerald-400";
  if (score >= 55) return "border-sky-500/50 text-sky-700 dark:text-sky-400";
  if (score >= 40) return "border-amber-500/50 text-amber-700 dark:text-amber-400";
  return "border-rose-500/50 text-rose-700 dark:text-rose-400";
}

export function RatingBadge({ score, confidence, carClass, size = "sm", showLabel = false }: Props) {
  if (score == null) return null;
  const rounded = Math.round(score);
  const color = ratingColor(score);
  const conf = confidence ?? 0;
  const confText =
    conf >= 1 ? "Fuld datagrundlag (leaderboard + resultater)"
    : conf >= 0.5 ? "Delvist datagrundlag – kun én datakilde"
    : "Estimat (baseret på platform-median)";
  const cls = size === "xs" ? "text-[10px] px-1.5 py-0 h-5" : "text-xs";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 ${color} ${cls} shrink-0 cursor-help`}>
            <Gauge className="h-3 w-3" />
            {showLabel ? "Rating " : ""}{rounded}
            {conf < 1 && <span className="opacity-60">~</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-0.5">
            <div><strong>Rating: {rounded}</strong>{carClass ? ` · ${carClass}` : ""}</div>
            <div className="text-muted-foreground">{confText}</div>
            <div className="text-muted-foreground">50 = platform-median · 20% bedste omgang · 80% løbsresultater</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
