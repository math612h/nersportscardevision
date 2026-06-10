import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Shield, Star, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CreateTeamDialog } from "@/components/CreateTeamDialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type TeamRow = {
  id: string;
  name: string;
  bio: string | null;
  logo_url: string | null;
  owner_id: string;
};

async function signedLogo(path: string) {
  const { data } = await supabase.storage.from("team-logos").createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

export function TeamsHub({ headerLabel = "Teams Hub" }: { headerLabel?: string }) {
  const { user } = useAuth();
  const [q, setQ] = useState("");

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("teams")
        .select("id, name, bio, logo_url, owner_id")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeamRow[];
    },
  });

  const teamIds = (teams ?? []).map((t) => t.id);
  const { data: memberData } = useQuery({
    queryKey: ["team-member-data", teamIds.join(",")],
    enabled: teamIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_members")
        .select("team_id, user_id")
        .in("team_id", teamIds);
      if (error) throw error;
      return (data ?? []) as { team_id: string; user_id: string }[];
    },
  });

  const memberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of memberData ?? []) counts[m.team_id] = (counts[m.team_id] ?? 0) + 1;
    return counts;
  }, [memberData]);

  const { data: teamRatingsData } = useQuery({
    queryKey: ["team-ratings", teamIds.sort().join(",")],
    enabled: teamIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_ratings")
        .select("team_id, score, percentile, confidence")
        .in("team_id", teamIds);
      if (error) throw error;
      return (data ?? []) as { team_id: string; score: number; percentile: number | null; confidence: number }[];
    },
  });

  const teamRatings = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const tid of teamIds) out[tid] = null;
    for (const r of teamRatingsData ?? []) {
      if (Number(r.confidence) > 0) out[r.team_id] = Math.round(Number(r.score));
    }
    return out;
  }, [teamRatingsData, teamIds]);

  const { data: logoMap } = useQuery({
    queryKey: ["team-logos", (teams ?? []).map((t) => t.logo_url).filter(Boolean).join(",")],
    enabled: !!teams?.some((t) => t.logo_url),
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        (teams ?? [])
          .filter((t) => t.logo_url)
          .map(async (t) => {
            const u = await signedLogo(t.logo_url!);
            if (u) map[t.id] = u;
          }),
      );
      return map;
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teams ?? [];
    return (teams ?? []).filter(
      (t) => t.name.toLowerCase().includes(needle) || (t.bio ?? "").toLowerCase().includes(needle),
    );
  }, [teams, q]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <Shield className="h-5 w-5" />
            <h1 className="text-2xl font-bold tracking-tight">{headerLabel}</h1>
          </div>
          <p className="text-sm text-muted-foreground">Søg, opret eller ansøg om medlemskab.</p>
        </div>
        {user && <CreateTeamDialog />}
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Søg efter team-navn…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Indlæser…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {q ? "Ingen teams matcher søgningen." : (user ? "Ingen teams endnu. Vær den første til at oprette ét." : "Ingen teams endnu. Log ind for at oprette et team.")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const initials = t.name.slice(0, 2).toUpperCase();
            const logo = logoMap?.[t.id];
            const count = memberCounts[t.id] ?? 0;
            const rating = teamRatings[t.id];
            return (
              <Link key={t.id} to="/teams/$teamId" params={{ teamId: t.id }}>
                <Card className="h-full transition hover:border-primary">
                  <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
                    <Avatar className="h-12 w-12">
                      {logo ? <AvatarImage src={logo} alt="" /> : null}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{t.name}</CardTitle>
                      <CardDescription className="line-clamp-2 text-xs">
                        {t.bio || "Ingen bio."}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-xs text-muted-foreground">
                    <Badge variant="outline" className="gap-1">
                      <Users className="h-3 w-3" /> {count} medlem{count === 1 ? "" : "mer"}
                    </Badge>
                    {rating != null && (
                      <Badge variant="outline" className="gap-1" title="Teamets gennemsnitlige rating">
                        <Star className="h-3 w-3 text-primary" /> {rating}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
