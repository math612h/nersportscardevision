import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CreateTeamDialog } from "@/components/CreateTeamDialog";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/teams/")({
  head: () => ({
    meta: [
      { title: "Teams – LMU-Hub" },
      { name: "description", content: "Se alle teams og deres medlemmer." },
      { property: "og:title", content: "Teams – LMU-Hub" },
      { property: "og:description", content: "Find teams, deres medlemmer og bios." },
    ],
  }),
  component: TeamsPage,
});

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

function TeamsPage() {
  const { user } = useAuth();

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
  const { data: memberCounts } = useQuery({
    queryKey: ["team-member-counts", teamIds.join(",")],
    enabled: teamIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_members")
        .select("team_id")
        .in("team_id", teamIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const m of (data ?? []) as { team_id: string }[]) {
        counts[m.team_id] = (counts[m.team_id] ?? 0) + 1;
      }
      return counts;
    },
  });

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

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <Shield className="h-5 w-5" />
            <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
          </div>
          <p className="text-sm text-muted-foreground">Alle teams på platformen.</p>
        </div>
        {user && <CreateTeamDialog />}
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Indlæser…</p>
      ) : (teams ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Ingen teams endnu. {user ? "Vær den første til at oprette ét." : "Log ind for at oprette et team."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(teams ?? []).map((t) => {
            const initials = t.name.slice(0, 2).toUpperCase();
            const logo = logoMap?.[t.id];
            const count = memberCounts?.[t.id] ?? 0;
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
                  <CardContent className="flex items-center gap-2 pt-0 text-xs text-muted-foreground">
                    <Badge variant="outline" className="gap-1">
                      <Users className="h-3 w-3" /> {count} medlem{count === 1 ? "" : "mer"}
                    </Badge>
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
