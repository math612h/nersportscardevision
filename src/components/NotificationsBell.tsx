import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

export function NotificationsBell() {
  const { user } = useAuth();

  const { data: unread } = useQuery({
    queryKey: ["unread-total", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [notif, dm] = await Promise.all([
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .is("read_at", null),
        supabase
          .from("direct_messages" as any)
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", user!.id)
          .is("read_at", null),
      ]);
      return (notif.count ?? 0) + (dm.count ?? 0);
    },
  });

  if (!user) return null;
  const count = unread ?? 0;

  return (
    <Link
      to="/beskeder"
      className="relative flex items-center gap-1 rounded px-2 py-1 hover:bg-accent"
      aria-label="Beskeder"
      title="Beskeder"
    >
      <MessageCircle className="h-4 w-4" />
      {count > 0 && (
        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{count}</Badge>
      )}
    </Link>
  );
}
