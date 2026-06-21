import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function useProfileComplete() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-status", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: profile }, { data: priv }] = await Promise.all([
        supabase.from("profiles").select("display_name, lmu_name, accepts_danish, media_consent").eq("id", user!.id).maybeSingle(),
        (supabase as unknown as { from: (t: string) => any }).from("profiles_private")
          .select("discord_user_id, address, postal_code, city").eq("user_id", user!.id).maybeSingle(),
      ]);
      const p = (priv ?? {}) as any;
      const pr = (profile ?? {}) as any;
      const email = (user?.email ?? "").trim();
      const hasRealEmail = !!email && !email.endsWith("@no-email.lmudanmark.dk");
      const discordLinked = !!p.discord_user_id;
      const complete = discordLinked
        && !!(pr.lmu_name ?? "").trim()
        && !!(pr.display_name ?? "").trim()
        && hasRealEmail
        && pr.accepts_danish === true
        && pr.media_consent === true
        && !!(p.address ?? "").trim()
        && !!(p.postal_code ?? "").trim()
        && !!(p.city ?? "").trim();
      return { complete, discordLinked };
    },
  });
  // If not signed in, treat as "complete" (no gating).
  if (!user) return { complete: true, loading: false, signedIn: false };
  return { complete: data?.complete ?? false, loading: isLoading, signedIn: true };
}
