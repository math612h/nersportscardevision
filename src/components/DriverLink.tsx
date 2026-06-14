import { UserAvatar } from "@/components/UserAvatar";

export function DriverLink({
  userId,
  name,
  className,
  size = "sm",
  showAvatar = true,
}: {
  userId?: string | null;
  name: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showAvatar?: boolean;
}) {
  if (!showAvatar) {
    if (!userId) return <span className={className}>{name}</span>;
    return (
      <UserAvatar userId={userId} name={name} size={size} linkClassName={className} />
    );
  }
  return (
    <UserAvatar
      userId={userId ?? null}
      name={name}
      size={size}
      linkClassName={className}
    />
  );
}

export async function getSignedAvatarUrl(path: string | null) {
  if (!path) return null;
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}
