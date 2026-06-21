import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { refreshMyDiscordAvatar } from "@/lib/discord-avatar.functions";

export const Route = createFileRoute("/_authenticated")({
  component: Gate,
});

function Gate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["onboarding-status", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: profile }, { data: priv }] = await Promise.all([
        supabase.from("profiles").select("display_name, lmu_name, accepts_danish, media_consent").eq("id", user!.id).maybeSingle(),
        (supabase as unknown as { from: (t: string) => any }).from("profiles_private")
          .select("discord_user_id, address, postal_code, city").eq("user_id", user!.id).maybeSingle(),
      ]);
      const p = (priv ?? {}) as { discord_user_id?: string | null; address?: string | null; postal_code?: string | null; city?: string | null };
      const pr = (profile ?? {}) as { display_name?: string | null; lmu_name?: string | null; accepts_danish?: boolean | null; media_consent?: boolean | null };
      const discordLinked = !!p.discord_user_id;
      const lmu = (pr.lmu_name ?? "").trim();
      const name = (pr.display_name ?? "").trim();
      const accepts = pr.accepts_danish === true;
      const mediaConsent = pr.media_consent === true;
      const address = (p.address ?? "").trim();
      const postal = (p.postal_code ?? "").trim();
      const city = (p.city ?? "").trim();
      const email = (user?.email ?? "").trim();
      const hasRealEmail = !!email && !email.endsWith("@no-email.lmudanmark.dk");
      return {
        discordLinked,
        complete: discordLinked && !!lmu && !!name && hasRealEmail && accepts && mediaConsent && !!address && !!postal && !!city,
      };
    },
  });


  // Refresh own Discord avatar højst hvert 10. minut.
  useEffect(() => {
    if (!user || !status?.discordLinked) return;
    const key = `discord-avatar-refreshed-at:${user.id}`;
    const last = Number(localStorage.getItem(key) ?? "0");
    if (Date.now() - last < 10 * 60 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
    refreshMyDiscordAvatar()
      .then((res) => {
        if (res?.ok) {
          queryClient.invalidateQueries({ queryKey: ["user-brief"] });
          queryClient.invalidateQueries({ queryKey: ["my-profile", user.id] });
        }
      })
      .catch(() => {});
  }, [user, status?.discordLinked, queryClient]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (statusLoading || !status) return;
    const path = location.pathname;
    const onOnboarding = path === "/onboarding";
    const onProfile = path.startsWith("/profil");
    const onHome = path === "/";
    // If Discord isn't linked, force onboarding (initial Discord OAuth step).
    if (!status.discordLinked && !onOnboarding) {
      navigate({ to: "/onboarding" });
      return;
    }
    // If complete and still on onboarding, send to home.
    if (status.complete && onOnboarding) {
      navigate({ to: "/" });
      return;
    }
    // If profile is incomplete (but Discord linked), only allow home, profile and onboarding.
    if (status.discordLinked && !status.complete && !onHome && !onProfile && !onOnboarding) {
      navigate({ to: "/" });
    }
  }, [loading, user, status, statusLoading, location.pathname, navigate]);

  if (loading || (user && statusLoading)) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Indlæser…</div>;
  }
  if (!user) return null;

  // While Discord is not linked we still hard-redirect to /onboarding.
  const onOnboarding = location.pathname === "/onboarding";
  if (status && !status.discordLinked && !onOnboarding) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Sender dig til profil-opsætning…</div>;
  }
  return <Outlet />;
}

