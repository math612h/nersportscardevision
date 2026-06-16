import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Users, Search, CheckCircle2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/brugere")({
  head: () => ({
    meta: [
      { title: "Brugere – LMU Danmark" },
      { name: "description", content: "Se alle brugere på platformen." },
      { property: "og:title", content: "Brugere – LMU Danmark" },
      { property: "og:description", content: "Find andre racere og se deres profiler." },
    ],
  }),
  component: UsersPage,
});

type ProfileRow = {
  id: string;
  display_name: string | null;
  lmu_name: string | null;
  avatar_url: string | null;
  discord_avatar_url: string | null;
  approved: boolean;
};

type RatingRow = { user_id: string; score: number | null; percentile: number | null };

async function signed(path: string) {
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

function UsersPage() {
  const [q, setQ] = useState("");

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, lmu_name, avatar_url, discord_avatar_url, approved")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const { data: ratings } = useQuery({
    queryKey: ["all-user-ratings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_ratings")
        .select("user_id,score,percentile");
      if (error) throw error;
      const m: Record<string, RatingRow> = {};
      (data ?? []).forEach((r: RatingRow) => { m[r.user_id] = r; });
      return m;
    },
  });

  const { data: avatars } = useQuery({
    queryKey: [
      "all-profile-avatars",
      (profiles ?? []).map((p) => `${p.id}:${p.discord_avatar_url ?? ""}:${p.avatar_url ?? ""}`).join(","),
    ],
    enabled: !!profiles?.some((p) => p.discord_avatar_url || p.avatar_url),
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        (profiles ?? []).map(async (p) => {
          if (p.discord_avatar_url) {
            map[p.id] = p.discord_avatar_url;
          } else if (p.avatar_url) {
            const u = await signed(p.avatar_url);
            if (u) map[p.id] = u;
          }
        }),
      );
      return map;
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return profiles ?? [];
    return (profiles ?? []).filter(
      (p) =>
        (p.display_name ?? "").toLowerCase().includes(needle) ||
        (p.lmu_name ?? "").toLowerCase().includes(needle),
    );
  }, [profiles, q]);

  const totalCount = profiles?.length ?? 0;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <Users className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">Brugere</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? "bruger" : "brugere"} på LMU Danmark.
        </p>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg navn eller LMU-navn…" className="pl-8" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Indlæser…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const initials = (p.display_name || "?").slice(0, 2).toUpperCase();
            const avatarUrl = avatars?.[p.id];
            const rating = ratings?.[p.id];
            const elo = rating?.score != null ? Math.round(rating.score) : null;
            return (
              <Link key={p.id} to="/profil/$userId" params={{ userId: p.id }}>
                <Card className="h-full transition hover:border-primary">
                  <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                    <Avatar className="h-12 w-12">
                      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-sm">{p.display_name ?? "Uden navn"}</CardTitle>
                      {p.lmu_name && (
                        <p className="truncate text-xs text-muted-foreground">{p.lmu_name}</p>
                      )}
                    </div>
                    {p.approved && (
                      <Badge variant="secondary" className="gap-1 text-[10px] text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" /> Godkendt
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Trophy className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium text-muted-foreground">Elo:</span>
                      <span className="font-semibold tabular-nums">{elo ?? "–"}</span>
                      {rating?.percentile != null && (
                        <span className="text-muted-foreground">· top {Math.max(1, Math.round(100 - rating.percentile))}%</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">Ingen brugere matcher din søgning.</p>
          )}
        </div>
      )}
    </div>
  );
}
