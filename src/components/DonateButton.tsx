import { Link } from "@tanstack/react-router";
import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "primary" | "outline" | "ghost";
  className?: string;
  label?: string;
  iconOnly?: boolean;
};

/**
 * "Køb os en kaffe" — genbrugelig donationsknap.
 * Bruges flere steder på siden så det er nemt for folk at støtte driften.
 */
export function DonateButton({
  size = "sm",
  variant = "primary",
  className,
  label = "Køb os en kaffe",
  iconOnly = false,
}: Props) {
  const primary =
    "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm hover:from-amber-500 hover:to-amber-700 border border-amber-500/60";
  const outline =
    "border border-amber-500/60 bg-background text-amber-600 hover:bg-amber-500/10 dark:text-amber-400";
  const ghost = "text-amber-600 hover:bg-amber-500/10 dark:text-amber-400";
  const classes = variant === "primary" ? primary : variant === "outline" ? outline : ghost;

  return (
    <Button asChild size={size} className={cn("gap-1.5", classes, className)} variant="ghost">
      <Link to="/donationer" aria-label={label} title={label}>
        <Coffee className={iconOnly ? "h-4 w-4" : "h-4 w-4"} />
        {!iconOnly && <span className="font-medium">{label}</span>}
      </Link>
    </Button>
  );
}
