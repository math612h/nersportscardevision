import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Calendar, EyeOff, ExternalLink, Flag, MapPin, MessageCircle, MessageSquareWarning, Trophy } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTrackImageFile } from "@/lib/tracks";

const PAGE_TITLE = "Nyheder — LMU Danmark";
const PAGE_DESC =
  "Seneste afviklede løb i LMU Danmark med baneinfo, klassevindere og top 3-resultater.";
const PAGE_URL = "https://danishenduranceseries.dk/";

type ResultRow = {
  car_number?: number;
  driver_name: string;
  car_class: string;
  driver_category?: string;
  class_position?: number;
  points?: number;
  fastest_lap?: boolean;
  dns?: boolean;
  dnf?: boolean;
};

export const Route = createFileRoute("/")({
  component: NewsHome,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:url", content: PAGE_URL },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
});

function NewsHome() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: divisions, isLoading } = useQuery({
    queryKey: ["home-recent-results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id,league_id,name,track,layout,race_date,created_at,settings,leagues(name)")
        .order("race_date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).filter(
        (d: any) =>
          d.settings?.completed &&
          !d.settings?.hidden_from_home &&
          Array.isArray(d.settings?.results) &&
          d.settings.results.length > 0,
      );
    },
  });

  const hideLatest = async (d: any) => {
    if (!confirm(`Skjul "${d.name}" fra forsiden?`)) return;
    const newSettings = { ...(d.settings ?? {}), hidden_from_home: true };
    const { error } = await supabase
      .from("divisions")
      .update({ settings: newSettings as any })
      .eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Skjult fra forsiden");
    qc.invalidateQueries({ queryKey: ["home-recent-results"] });
  };

  const latest = divisions?.[0] as any | undefined;
  const otherResults = (divisions ?? []).slice(1, 4) as any[];
  const trackFile = getTrackImageFile(latest?.track);

  const { data: trackImageMap } = useQuery({
    queryKey: ["home-track-image", trackFile ?? "none"],
    enabled: !!trackFile,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("track-images")
        .createSignedUrls([trackFile!], 60 * 60 * 24 * 7);
      if (error) throw error;
      return data?.[0]?.signedUrl ?? null;
    },
  });

  const groupedResults = groupTopThree((latest?.settings?.results ?? []) as ResultRow[]);

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            LMU Danmark
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Nyheder</h1>
          <p className="text-sm text-muted-foreground">Seneste afviklede løb og resultater.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="gap-2">
            <Link to="/lmu/liga">
              <Flag className="h-4 w-4" /> Ligaer
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/lmu/teams">
              <ArrowUpRight className="h-4 w-4" /> Teams
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <a
              href="https://discord.gg/Vz4JvSk4dm"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-4 w-4" /> Discord
            </a>
          </Button>
        </div>
      </header>

      <NewsPostsSection />

      {isLoading && (
        <div className="h-96 animate-pulse rounded-xl border border-border bg-card/50" />
      )}

      {!isLoading && !latest && (
        <section className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Der vises nyheder her, når første afdeling er markeret som afsluttet med resultater.
        </section>
      )}

      {latest && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2 text-primary">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Seneste løb</h2>
            </div>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => hideLatest(latest)}
                className="gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <EyeOff className="h-3.5 w-3.5" /> Skjul fra forsiden
              </Button>
            )}
          </div>
          <article className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted sm:aspect-[21/9]">
              {trackImageMap ? (
                <img
                  src={trackImageMap}
                  alt={latest.track ?? latest.name}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-transparent" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/45 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 space-y-3 p-4 sm:p-6">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Afsluttet</Badge>
                  {latest.leagues?.name && <Badge variant="outline">{latest.leagues.name}</Badge>}
                  {latest.race_date && (
                    <Badge variant="outline" className="gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(latest.race_date), "dd MMM yyyy")}
                    </Badge>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight sm:text-3xl">{latest.name}</h2>
                  {latest.track && (
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {latest.track}
                      {latest.layout ? ` · ${latest.layout}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              {groupedResults.map((group) => (
                <div key={group.key} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{group.label}</h3>
                    {group.winner && (
                      <Badge className="gap-1">
                        <Trophy className="h-3 w-3" />
                        {group.winner.driver_name}
                      </Badge>
                    )}
                  </div>
                  <ol className="grid gap-2 sm:grid-cols-3">
                    {group.top.map((row) => (
                      <li
                        key={`${group.key}-${row.class_position}-${row.driver_name}`}
                        className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                      >
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-background font-semibold tabular-nums">
                          {row.class_position}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {row.driver_name}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {row.points ?? 0} p
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {otherResults.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Calendar className="h-4 w-4" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Tidligere løb</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {otherResults.map((d) => (
              <div key={d.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold">{d.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{d.leagues?.name ?? "Liga"}</p>
                {d.track && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {d.track}
                    {d.layout ? ` · ${d.layout}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function groupTopThree(results: ResultRow[]) {
  const groups = new Map<string, ResultRow[]>();
  for (const r of results) {
    if (r.dns || r.dnf || !r.driver_name) continue;
    const key = `${r.car_class}${r.driver_category ? ` · ${r.driver_category}` : ""}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  return Array.from(groups.entries())
    .map(([key, rows]) => {
      const top = rows
        .filter((r) => Number(r.class_position) > 0)
        .sort((a, b) => Number(a.class_position) - Number(b.class_position))
        .slice(0, 3);
      return { key, label: key, top, winner: top[0] };
    })
    .filter((g) => g.top.length > 0);
}

type NewsPost = {
  id: string;
  title: string;
  body: string | null;
  image_path: string | null;
  expires_at: string;
};

function NewsPostsSection() {
  const { data: posts } = useQuery({
    queryKey: ["home-news-posts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("news_posts")
        .select("id,title,body,image_path,expires_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NewsPost[];
    },
  });

  const imagePaths = (posts ?? []).map((p) => p.image_path).filter((p): p is string => !!p);

  const { data: imageMap } = useQuery({
    queryKey: ["home-news-images", imagePaths.sort().join(",")],
    enabled: imagePaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("news-images")
        .createSignedUrls(imagePaths, 60 * 60 * 24 * 7);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => {
        if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      });
      return m;
    },
  });

  if (!posts || posts.length === 0) return null;

  return (
    <section className="space-y-4">
      {posts.map((post) => (
        <article
          key={post.id}
          className="overflow-hidden rounded-xl border border-primary/30 bg-card"
        >
          <div className="space-y-3 p-4 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Nyhed</p>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{post.title}</h2>
            {post.body && (
              <div
                className="prose-news text-sm text-foreground/90"
                dangerouslySetInnerHTML={{ __html: post.body }}
              />
            )}
          </div>
          {post.image_path && imageMap?.[post.image_path] && (
            <div className="relative max-h-64 w-full overflow-hidden">
              <img
                src={imageMap[post.image_path]}
                alt={post.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

