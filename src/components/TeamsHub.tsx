import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Shield, Star, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CreateTeamDialog } from "@/components/CreateTeamDialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { GuestBlur } from "@/components/GuestGate";

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

  const totalMembers = useMemo(
    () => Object.values(memberCounts).reduce((a, b) => a + b, 0),
    [memberCounts],
  );

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <header className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/25 via-primary/5 to-transparent px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                Fællesskab
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{headerLabel}</h1>
              <p className="text-sm text-muted-foreground">
                Søg, opret eller ansøg om medlemskab.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-muted/30 px-4 py-2.5 text-xs sm:px-6">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Shield className="h-3.5 w-3.5 text-primary" />
            {(teams ?? []).length} team{(teams ?? []).length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {totalMembers} medlem{totalMembers === 1 ? "" : "mer"} i alt
          </span>
        </div>

        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-6">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg efter team-navn…"
              className="pl-9"
            />
          </div>
          {user && <CreateTeamDialog />}
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Indlæser…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {q
            ? "Ingen teams matcher søgningen."
            : user
              ? "Ingen teams endnu. Vær den første til at oprette ét."
              : "Ingen teams endnu. Log ind for at oprette et team."}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const initials = t.name.slice(0, 2).toUpperCase();
            const logo = logoMap?.[t.id];
            const count = memberCounts[t.id] ?? 0;
            const rating = teamRatings[t.id];
            const cardInner = (
              <Card className="group h-full overflow-hidden transition hover:border-primary hover:shadow-md">
                <div className="relative h-20 overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-transparent">
                  {logo ? (
                    <img
                      src={logo}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-xl"
                    />
                  ) : null}
                </div>
                <div className="-mt-8 px-4 pb-4">
                  <Avatar className="h-14 w-14 ring-4 ring-card">
                    {logo ? <AvatarImage src={logo} alt="" /> : null}
                    <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <h3 className="mt-3 truncate text-base font-semibold tracking-tight">{t.name}</h3>
                  <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">
                    {t.bio || "Ingen bio."}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="outline" className="gap-1">
                      <Users className="h-3 w-3" /> {count}
                    </Badge>
                    {rating != null && (
                      <Badge variant="outline" className="gap-1" title="Teamets rating">
                        <Star className="h-3 w-3 text-primary" /> {rating}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
            if (!user) {
              return (
                <GuestBlur key={t.id} active label="Log ind">
                  {cardInner}
                </GuestBlur>
              );
            }
            return (
              <Link key={t.id} to="/teams/$teamId" params={{ teamId: t.id }}>
                {cardInner}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
