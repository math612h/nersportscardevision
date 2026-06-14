import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: Gate,
});

function Gate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["onboarding-status", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: profile }, { data: priv }] = await Promise.all([
        supabase.from("profiles").select("display_name, lmu_name").eq("id", user!.id).maybeSingle(),
        (supabase as unknown as { from: (t: string) => any }).from("profiles_private")
          .select("discord_user_id").eq("user_id", user!.id).maybeSingle(),
      ]);
      const discordLinked = !!(priv as { discord_user_id?: string | null } | null)?.discord_user_id;
      const lmu = (profile as { lmu_name?: string | null } | null)?.lmu_name?.trim() ?? "";
      const name = (profile as { display_name?: string | null } | null)?.display_name?.trim() ?? "";
      const email = (user?.email ?? "").trim();
      const hasRealEmail = !!email && !email.endsWith("@no-email.lmudanmark.dk");
      return { discordLinked, complete: discordLinked && !!lmu && !!name && hasRealEmail };
    },
  });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (statusLoading || !status) return;
    const onOnboarding = location.pathname === "/onboarding";
    if (!status.complete && !onOnboarding) {
      navigate({ to: "/onboarding" });
    } else if (status.complete && onOnboarding) {
      navigate({ to: "/" });
    }
  }, [loading, user, status, statusLoading, location.pathname, navigate]);

  if (loading || (user && statusLoading)) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Indlæser…</div>;
  }
  if (!user) return null;
  return <Outlet />;
}
