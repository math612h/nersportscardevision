import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RatingBadge } from "@/components/RatingBadge";

export const Route = createFileRoute("/_authenticated/profil/$userId")({
  head: () => ({ meta: [{ title: "Profil – LMU Danmark" }] }),
  component: PublicProfile,
});

async function signedAvatarUrl(path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}

function PublicProfile() {
  const { userId } = Route.useParams();
  const router = useRouter();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const [{ data, error }, { data: priv }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, lmu_name, bio, achievements, avatar_url, discord_avatar_url, approved")
          .eq("id", userId)
          .maybeSingle(),
        supabase.rpc("get_profile_private", { _user_id: userId }).maybeSingle(),
      ]);
      if (error) throw error;
      if (!data) return null;
      return { ...data, age: priv?.age ?? null, discord_username: priv?.discord_username ?? null };
    },
  });

  const { data: avatarUrl } = useQuery({
    queryKey: ["avatar-url", profile?.discord_avatar_url, profile?.avatar_url],
    enabled: !!profile && (!!profile.discord_avatar_url || !!profile.avatar_url),
    queryFn: () => profile?.discord_avatar_url ?? signedAvatarUrl(profile!.avatar_url),
  });

  const { data: rating } = useQuery({
    queryKey: ["user-rating", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_ratings")
        .select("score,percentile,races_count")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as { score: number; percentile: number | null; races_count: number } | null;
    },
  });

  if (isLoading) return <div className="mx-auto max-w-2xl px-4 py-10 text-muted-foreground">Indlæser…</div>;
  if (!profile) return <div className="mx-auto max-w-2xl px-4 py-10">Profil ikke fundet.</div>;

  const name = profile.display_name || profile.lmu_name || "Ukendt kører";
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Tilbage
      </Button>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle>{name}</CardTitle>
              <div className="flex flex-wrap gap-1.5">
                {profile.approved && (
                  <Badge variant="secondary" className="gap-1 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" /> Godkendt kører
                  </Badge>
                )}
                {profile.lmu_name && <Badge variant="secondary">LMU: {profile.lmu_name}</Badge>}
                {profile.age != null && <Badge variant="outline">{profile.age} år</Badge>}
                {profile.discord_username && <Badge variant="outline">Discord: {profile.discord_username}</Badge>}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {profile.bio && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Bio</h3>
              <p className="whitespace-pre-wrap text-sm">{profile.bio}</p>
            </section>
          )}
          {profile.achievements && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Achievements</h3>
              <p className="whitespace-pre-wrap text-sm">{profile.achievements}</p>
            </section>
          )}
          {rating && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">ELO-rating</h3>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{rating.races_count} løb kørt</span>
                <RatingBadge
                  score={Number(rating.score)}
                  percentile={rating.percentile != null ? Number(rating.percentile) : null}
                  confidence={1}
                />
              </div>
            </section>
          )}
          {!profile.bio && !profile.achievements && (
            <p className="text-sm text-muted-foreground">Brugeren har endnu ikke udfyldt sin profil.</p>
          )}
          <div>
            <Link to="/leaderboard" className="text-xs text-primary hover:underline">
              Se leaderboard →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
