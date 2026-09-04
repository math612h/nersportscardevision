import { cn } from "@/lib/utils";
import { RESULT_STATUS_LABEL, isResultStatus, type ResultStatus } from "@/lib/result-status";

const STYLE: Record<ResultStatus, string> = {
  classified: "",
  ret: "border-amber-500/50 text-amber-500",
  dnf: "border-destructive/50 text-destructive",
  dns: "border-muted-foreground/40 text-muted-foreground",
  dsq: "border-destructive text-destructive",
  nt: "border-muted-foreground/40 text-muted-foreground",
};

export function ResultStatusBadge({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  if (!isResultStatus(status) || status === "classified") return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1 py-0.5 text-[10px] font-semibold uppercase leading-none",
        STYLE[status],
        className,
      )}
    >
      {RESULT_STATUS_LABEL[status]}
    </span>
  );
}
