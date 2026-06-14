import { Link } from "@tanstack/react-router";
import { Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Full-page block shown to guests on pages they may not access at all.
 */
export function GuestLock({
  title = "Log ind for at se denne side",
  message = "Indholdet er kun tilgængeligt for medlemmer af LMU Danmark. Log ind med din konto for at fortsætte.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-4 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <Button asChild>
          <Link to="/login">
            <LogIn className="h-4 w-4" />
            Log ind
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Blurs the wrapped children for guests and overlays a lock + "Log ind" CTA.
 * Disables pointer interaction so guests cannot click through.
 *
 * When `active` is false, children render normally.
 */
export function GuestBlur({
  active,
  children,
  label = "Log ind for at se",
  className = "",
}: {
  active: boolean;
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  if (!active) return <>{children}</>;
  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none select-none blur-md saturate-50 opacity-60"
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground shadow-md backdrop-blur transition hover:bg-primary hover:text-primary-foreground"
        >
          <Lock className="h-3.5 w-3.5" />
          {label}
        </Link>
      </div>
    </div>
  );
}
