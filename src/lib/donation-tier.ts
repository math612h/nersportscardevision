import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";


export type DonationTier = "bronze" | "silver" | "gold" | null;

export const TIER_LABEL: Record<Exclude<DonationTier, null>, string> = {
  bronze: "Bronze",
  silver: "Sølv",
  gold: "Guld",
};

// Ring/border classes tuned to match the design system tokens where possible.
// Full glamorous border for cards/rows. Uses layered box-shadows to create
// a metallic sheen with an outer glow.
export function donationBorderClass(tier: DonationTier): string {
  switch (tier) {
    case "bronze":
      return "rounded-lg border-2 border-[#ff9a3c] shadow-[inset_0_1px_0_0_rgba(255,220,180,0.6),0_0_12px_0_rgba(255,140,50,0.45),0_0_24px_0_rgba(255,120,40,0.25)]";
    case "silver":
      return "rounded-lg border-2 border-[#e8e8f0] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),0_0_12px_0_rgba(220,225,240,0.55),0_0_24px_0_rgba(200,210,230,0.3)]";
    case "gold":
      return "rounded-lg border-2 border-[#ffdf5a] shadow-[inset_0_1px_0_0_rgba(255,245,190,0.85),0_0_14px_0_rgba(255,200,50,0.6),0_0_28px_0_rgba(255,180,30,0.35)]";
    default:
      return "";
  }
}

// Alias for full-card outline (previously a left accent). Kept for compatibility.
export const donationAccentClass = donationBorderClass;

export function donationRingClass(tier: DonationTier): string {
  switch (tier) {
    case "bronze":
      return "ring-2 ring-[#ff9a3c] ring-offset-1 ring-offset-background";
    case "silver":
      return "ring-2 ring-[#e8e8f0] ring-offset-1 ring-offset-background";
    case "gold":
      return "ring-2 ring-[#ffdf5a] ring-offset-1 ring-offset-background";
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
