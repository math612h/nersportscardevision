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

// Subtle 1px border with a strong glossy inner sheen and soft outer glow.
// Uses layered inset shadows to fake a metallic highlight along the top edge.
export function donationBorderClass(tier: DonationTier): string {
  switch (tier) {
    case "bronze":
      return "rounded-lg border border-[#c97a2b]/80 shadow-[inset_0_1px_0_0_rgba(255,220,180,0.6),inset_0_-1px_0_0_rgba(120,60,10,0.4),inset_0_0_10px_0_rgba(255,160,70,0.28),0_0_6px_0_rgba(255,140,50,0.35)]";
    case "silver":
      return "rounded-lg border border-[#cfd3dc]/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9),inset_0_-1px_0_0_rgba(120,130,150,0.35),inset_0_0_10px_0_rgba(220,225,240,0.4),0_0_6px_0_rgba(210,220,240,0.4)]";
    case "gold":
      return "rounded-lg border border-[#e6b422]/90 shadow-[inset_0_1px_0_0_rgba(255,245,190,0.95),inset_0_-1px_0_0_rgba(140,90,10,0.4),inset_0_0_12px_0_rgba(255,210,80,0.45),0_0_8px_0_rgba(255,190,40,0.45)]";
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

/**
 * Wraps any element (li, div, tr, etc.) with the donor tier border/glow.
 * Applies extra padding+margin so the outline sits nicely around the row/card.
 * Renders as the given element (defaults to div) and forwards all extra props.
 */
type DonorFrameProps = {
  userId: string | null | undefined;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  /** When true, no extra padding/margin is added. Use when parent already sets spacing. */
  bare?: boolean;
  children?: React.ReactNode;
} & Record<string, any>;

export function DonorFrame({ userId, as = "div", className, bare = false, children, ...rest }: DonorFrameProps) {
  const tier = useDonationTier(userId);
  const Comp = as as any;
  return (
    <Comp
      className={cn(className, tier && !bare && "px-3 my-1", donationBorderClass(tier))}
      {...rest}
    >
      {children}
    </Comp>
  );
}

