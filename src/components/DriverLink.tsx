import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function DriverLink({
  userId,
  name,
  className,
}: {
  userId?: string | null;
  name: string;
  className?: string;
}) {
  if (!userId) return <span className={className}>{name}</span>;
  return (
    <Link
      to="/profil/$userId"
      params={{ userId }}
      className={cn("hover:underline hover:text-primary transition-colors", className)}
    >
      {name}
    </Link>
  );
}

export async function getSignedAvatarUrl(path: string | null) {
  if (!path) return null;
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}
