import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DonationTier = "bronze" | "silver" | "gold" | null;

export const TIER_LABEL: Record<Exclude<DonationTier, null>, string> = {
  bronze: "Bronze",
  silver: "Sølv",
  gold: "Guld",
};

// Ring/border classes tuned to match the design system tokens where possible.
export function donationBorderClass(tier: DonationTier): string {
  switch (tier) {
    case "bronze":
      return "border-2 border-[#cd7f32] shadow-[0_0_0_1px_rgba(205,127,50,0.35)]";
    case "silver":
      return "border-2 border-[#c0c0c0] shadow-[0_0_0_1px_rgba(192,192,192,0.35)]";
    case "gold":
      return "border-2 border-[#ffd700] shadow-[0_0_0_1px_rgba(255,215,0,0.4)]";
    default:
      return "";
  }
}

export function donationRingClass(tier: DonationTier): string {
  switch (tier) {
    case "bronze":
      return "ring-2 ring-[#cd7f32] ring-offset-1 ring-offset-background";
    case "silver":
      return "ring-2 ring-[#c0c0c0] ring-offset-1 ring-offset-background";
    case "gold":
      return "ring-2 ring-[#ffd700] ring-offset-1 ring-offset-background";
    default:
      return "";
  }
}

export function useDonationTier(userId: string | null | undefined): DonationTier {
  const { data } = useQuery({
    queryKey: ["donation-tier", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("donation_tier")
        .eq("id", userId!)
        .maybeSingle();
      return ((data?.donation_tier as DonationTier) ?? null);
    },
  });
  return (data ?? null) as DonationTier;
}
