import { BadgeCheck, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Viser om en afdelings resultater er endelige ("Bekræftet") eller stadig
 * kan ændre sig ("Ikke bekræftet" – fx manglende straffe).
 */
export function ResultsStatusBadge({
  confirmed,
  className,
}: {
  confirmed: boolean;
  className?: string;
}) {
  return confirmed ? (
    <Badge variant="secondary" className={`gap-1 text-[10px] ${className ?? ""}`}>
      <BadgeCheck className="h-3 w-3 text-primary" aria-hidden="true" />
      Bekræftet
    </Badge>
  ) : (
    <Badge variant="outline" className={`gap-1 border-destructive/40 text-[10px] text-destructive ${className ?? ""}`}>
      <CircleAlert className="h-3 w-3" aria-hidden="true" />
      Ikke bekræftet
    </Badge>
  );
}
