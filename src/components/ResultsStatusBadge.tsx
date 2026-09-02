import { BadgeCheck, CircleAlert, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Viser om en afdelings resultater er udgivet, og om de er endelige
 * ("Bekræftet") eller stadig kan ændre sig (fx manglende steward-straffe).
 */
export function ResultsStatusBadge({
  confirmed,
  published = true,
  className,
}: {
  confirmed: boolean;
  published?: boolean;
  className?: string;
}) {
  if (!published) {
    return (
      <Badge variant="outline" className={`gap-1 text-[10px] ${className ?? ""}`}>
        <EyeOff className="h-3 w-3" aria-hidden="true" />
        Ikke udgivet
      </Badge>
    );
  }
  return confirmed ? (
    <Badge variant="secondary" className={`gap-1 text-[10px] ${className ?? ""}`}>
      <BadgeCheck className="h-3 w-3 text-primary" aria-hidden="true" />
      Bekræftet
    </Badge>
  ) : (
    <Badge variant="outline" className={`gap-1 border-destructive/40 text-[10px] text-destructive ${className ?? ""}`}>
      <CircleAlert className="h-3 w-3" aria-hidden="true" />
      Ikke bekræftet · afventer steward-indsigelser
    </Badge>
  );
}
