import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wifi, Globe, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PRESENCE_CHANNEL, type PresencePayload } from "@/lib/presence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_admin/admin/online")({
  component: AdminOnlinePage,
});

type OnlineEntry = {
  key: string;
  userId: string | null;
  path: string;
  since: number;
};

function formatDuration(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec} sek.`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min.`;
  const h = Math.floor(min / 60);
  return `${h} t. ${min % 60} min.`;
}

function AdminOnlinePage() {
  const [entries, setEntries] = useState<OnlineEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ch = supabase.channel(PRESENCE_CHANNEL);
    const sync = () => {
      const state = ch.presenceState<PresencePayload>();
      const list: OnlineEntry[] = [];
      for (const [key, metas] of Object.entries(state)) {
        const p = metas[metas.length - 1];
        if (!p) continue;
        list.push({
          key,
          userId: p.userId ?? null,
          path: p.path ?? "/",
          since: typeof p.since === "number" ? p.since : Date.now(),
        });
      }
      setEntries(list);
    };
    ch.on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  // Ticking clock so durations update while the page is open
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const userIds = useMemo(
    () => [...new Set(entries.map((e) => e.userId).filter((x): x is string => !!x))],
    [entries],
  );

  const { data: profiles } = useQuery({
    queryKey: ["online-profiles", userIds.slice().sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, lmu_name, avatar_url, discord_avatar_url")
        .in("id", userIds);
      return data ?? [];
    },
  });

  const nameOf = (userId: string | null) => {
    if (!userId) return "Gæst (ikke logget ind)";
    const p = profiles?.find((x) => x.id === userId);
    return p?.display_name || p?.lmu_name || "Bruger";
  };

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.since - b.since),
    [entries],
  );

  const guests = sorted.filter((e) => !e.userId).length;
  const loggedIn = sorted.length - guests;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wifi className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Online nu</h1>
        <Badge variant={connected ? "default" : "secondary"} className="ml-auto">
          {connected ? "Live" : "Forbinder…"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Opdateres live mens brugerne bevæger sig rundt på siden. "Online i" måler fra den aktuelle browser-session startede.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Online lige nu</CardDescription>
              <Wifi className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-3xl">{sorted.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Logget ind</CardDescription>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-3xl">{loggedIn}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Gæster</CardDescription>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-3xl">{guests}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Besøgende lige nu</CardTitle>
          <CardDescription>Længst online øverst</CardDescription>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {connected ? "Ingen besøgende online lige nu." : "Henter live-data…"}
            </p>
          ) : (
            <div className="divide-y rounded border">
              {sorted.map((e) => (
                <div key={e.key} className="flex items-center gap-3 p-3 text-sm">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{nameOf(e.userId)}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{e.path}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-normal">
                    {formatDuration(now - e.since)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
