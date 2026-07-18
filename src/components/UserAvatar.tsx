import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { DonationTier } from "@/lib/donation-tier";


type Size = "xs" | "sm" | "md" | "lg" | "xl";

const sizeMap: Record<Size, string> = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-20 w-20 text-lg",
};

type Brief = {
  display_name: string | null;
  lmu_name: string | null;
  avatar_url: string | null;
  discord_avatar_url: string | null;
  donation_tier: DonationTier;
};

export function useUserBrief(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["user-brief", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("display_name, lmu_name, avatar_url, discord_avatar_url, donation_tier")
        .eq("id", userId!)
        .maybeSingle();
      return (data ?? null) as Brief | null;
    },
  });
}


async function signedAvatar(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

function useResolvedAvatarUrl(brief: Brief | null | undefined) {
  // Priority: Discord vinder altid (per brugerens valg). Fallback til uploadet.
  const discord = brief?.discord_avatar_url ?? null;
  const uploaded = brief?.avatar_url ?? null;
  const needsSign = !discord && !!uploaded;
  const { data: signed } = useQuery({
    queryKey: ["avatar-signed", uploaded],
    enabled: needsSign,
    staleTime: 60 * 60 * 1000,
    queryFn: () => signedAvatar(uploaded!),
  });
  return discord ?? signed ?? null;
}

export function UserAvatarOnly({
  userId,
  fallbackName,
  size = "sm",
  className,
}: {
  userId: string | null | undefined;
  fallbackName?: string | null;
  size?: Size;
  className?: string;
}) {
  const { data: brief } = useUserBrief(userId);
  const url = useResolvedAvatarUrl(brief);
  const name = brief?.display_name || brief?.lmu_name || fallbackName || "?";
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <Avatar className={cn(sizeMap[size], "shrink-0", className)}>
      {url ? <AvatarImage src={url} alt={name} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );

}

export function UserAvatar({
  userId,
  name,
  size = "sm",
  showName = true,
  linkClassName,
  className,
}: {
  userId: string | null | undefined;
  name: string;
  size?: Size;
  showName?: boolean;
  linkClassName?: string;
  className?: string;
}) {
  const { data: brief } = useUserBrief(userId);
  const resolvedName = brief?.display_name || brief?.lmu_name || name;
  const content = (
    <span className={cn("inline-flex items-center gap-2 min-w-0", className)}>
      <UserAvatarOnly userId={userId} fallbackName={resolvedName} size={size} />
      {showName ? <span className={cn("truncate", linkClassName)}>{resolvedName}</span> : null}
    </span>
  );
  if (!userId) return content;
  return (
    <Link
      to="/profil/$userId"
      params={{ userId }}
      className="inline-flex items-center gap-2 min-w-0 hover:text-primary transition-colors"
    >
      <UserAvatarOnly userId={userId} fallbackName={resolvedName} size={size} />
      {showName ? <span className={cn("truncate hover:underline", linkClassName)}>{resolvedName}</span> : null}
    </Link>
  );
}
