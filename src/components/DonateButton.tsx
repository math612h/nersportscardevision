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
  size = "default",
  variant = "primary",
  className,
  label = "Køb os en kaffe",
  iconOnly = false,
}: Props) {
  const primary =
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 border border-primary/60";
  const outline =
    "border border-primary/60 bg-background text-primary hover:bg-primary/10";
  const ghost = "text-primary hover:bg-primary/10";
  const classes = variant === "primary" ? primary : variant === "outline" ? outline : ghost;

  return (
    <Button asChild size={size} className={cn("gap-1.5", classes, className)} variant="ghost">
      <Link to="/donationer" aria-label={label} title={label}>
        <Coffee className="h-4 w-4" />
        {!iconOnly && <span className="font-medium">{label}</span>}
      </Link>
    </Button>
  );
}
