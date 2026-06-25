import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";
const sizeMap: Record<Size, string> = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

async function signedLogo(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("team-logos").createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

export function useTeamBrief(teamId: string | null | undefined) {
  return useQuery({
    queryKey: ["team-brief", teamId],
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id,name,logo_url")
        .eq("id", teamId!)
        .maybeSingle();
      return (data ?? null) as { id: string; name: string; logo_url: string | null } | null;
    },
  });
}

export function TeamAvatarOnly({
  teamId,
  fallbackName,
  size = "sm",
  className,
}: {
  teamId: string | null | undefined;
  fallbackName?: string | null;
  size?: Size;
  className?: string;
}) {
  const { data: brief } = useTeamBrief(teamId);
  const path = brief?.logo_url ?? null;
  const { data: url } = useQuery({
    queryKey: ["team-logo-signed", path],
    enabled: !!path,
    staleTime: 60 * 60 * 1000,
    queryFn: () => signedLogo(path!),
  });
  const name = brief?.name ?? fallbackName ?? "?";
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <Avatar className={cn(sizeMap[size], "shrink-0 rounded-md", className)}>
      {url ? <AvatarImage src={url} alt={name} className="object-cover" /> : null}
      <AvatarFallback className="rounded-md">{initials}</AvatarFallback>
    </Avatar>
  );
}
