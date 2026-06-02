import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: items } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,link,read_at,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  if (!user) return null;
  const unread = (items ?? []).filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!items?.length) return;
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative flex items-center gap-1 rounded px-2 py-1 hover:bg-accent" aria-label="Beskeder">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{unread}</Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Beskeder</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={markAllRead}>
              <Check className="h-3 w-3" /> Markér alle som læst
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(!items || items.length === 0) && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Ingen beskeder.</p>
          )}
          <ul className="divide-y divide-border">
            {items?.map((n) => {
              const body = (
                <div className={`px-3 py-2 ${!n.read_at ? "bg-primary/5" : ""}`}>
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: da })}
                  </p>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={() => { void markOneRead(n.id); setOpen(false); }}
                      className="block hover:bg-accent"
                    >
                      {body}
                    </Link>
                  ) : (
                    <button onClick={() => void markOneRead(n.id)} className="block w-full text-left hover:bg-accent">
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
