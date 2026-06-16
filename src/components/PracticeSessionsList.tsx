import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Timer, Users } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function Countdown({ target }: { target: number }) {
  const now = useNow(true);
  const diff = target - now;
  if (diff <= 0) {
    return <Badge className="gap-1 bg-primary text-primary-foreground"><Timer className="h-3 w-3" /> I gang / overstået</Badge>;
  }
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const label = d > 0 ? `${d}d ${h}t ${m}m` : h > 0 ? `${h}t ${m}m ${String(sec).padStart(2, "0")}s` : `${m}m ${String(sec).padStart(2, "0")}s`;
  const soon = diff < 60 * 60 * 1000;
  return (
    <Badge variant={soon ? "default" : "outline"} className={`gap-1 ${soon ? "bg-primary text-primary-foreground" : ""}`}>
      <Timer className="h-3 w-3" /> {label}
    </Badge>
  );
}

export function PracticeSessionsList({ divisionId }: { divisionId: string }) {
  const { data: sessions } = useQuery({
    queryKey: ["practice-sessions", divisionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("division_practice_sessions" as any)
        .select("*")
        .eq("division_id", divisionId)
        .order("starts_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (!sessions || sessions.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 rounded border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="h-3 w-3" /> Practice sessions
      </div>
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li key={s.id} className="space-y-1 rounded border border-border/70 bg-background/60 p-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{s.server_name || "Practice server"}</span>
              {s.starts_at && <Countdown target={new Date(s.starts_at).getTime()} />}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">P: {s.practice_minutes ?? "—"}m</Badge>
              {s.has_qualifying && <Badge variant="outline" className="text-[10px]">Q: {s.qualifying_minutes ?? "—"}m</Badge>}
              {s.has_race && <Badge variant="outline" className="text-[10px]">R: {s.race_minutes ?? "—"}m</Badge>}
              {s.starts_at && (
                <Badge variant="outline" className="text-[10px]">
                  {format(new Date(s.starts_at), "dd MMM HH:mm")}
                </Badge>
              )}
            </div>
            {(s.lobby_code || s.lobby_password) && (
              <ul className="space-y-0.5 rounded border border-border/60 bg-muted/40 p-1.5 font-mono text-[11px]">
                {s.lobby_code && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Code</span><span className="truncate">{s.lobby_code}</span></li>
                )}
                {s.lobby_password && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Password</span><span className="truncate">{s.lobby_password}</span></li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
