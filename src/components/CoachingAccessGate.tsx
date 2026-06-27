import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export function CoachingAccessGate({ children }: { children: ReactNode }) {
  const { user, isAdmin, isCoach, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = !!user && (isAdmin || isCoach);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!allowed) {
      navigate({ to: "/" });
    }
  }, [loading, user, allowed, navigate]);

  if (loading || !allowed) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Indlæser…</div>;
  }
  return <>{children}</>;
}
