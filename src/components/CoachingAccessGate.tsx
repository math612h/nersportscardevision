import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function CoachingAccessGate({ children }: { children: ReactNode }) {
  const { user, isAdmin, isCoach, loading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (isAdmin || isCoach) {
      setAllowed(true);
      setChecking(false);
      return;
    }
    // Fallback: roles in context may be stale (e.g. just granted). Re-check live.
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!active) return;
      const ok = !!data?.some((r) => r.role === "admin" || r.role === "coach");
      if (ok) {
        setAllowed(true);
        setChecking(false);
      } else {
        navigate({ to: "/" });
      }
    })();
    return () => {
      active = false;
    };
  }, [loading, user, isAdmin, isCoach, navigate]);

  if (loading || checking || !allowed) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Indlæser…</div>;
  }
  return <>{children}</>;
}
