import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/nyheder")({
  head: () => ({
    meta: [
      { title: "Nyheder — LMU Danmark" },
      { name: "description", content: "Alle nyheder fra LMU Danmark." },
      { property: "og:title", content: "Nyheder — LMU Danmark" },
      { property: "og:description", content: "Alle nyheder fra LMU Danmark." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NyhederPage,
});

type NewsPost = {
  id: string;
  title: string;
  body: string | null;
  image_path: string | null;
  expires_at: string;
  created_at?: string;
};

function NyhederPage() {
  const { data: posts } = useQuery({
    queryKey: ["all-news-posts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("news_posts")
        .select("id,title,body,image_path,expires_at,created_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NewsPost[];
    },
  });

  const imagePaths = (posts ?? []).map((p) => p.image_path).filter((p): p is string => !!p);

  const { data: imageMap } = useQuery({
    queryKey: ["all-news-images", imagePaths.sort().join(",")],
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

  // Scroll to hash after content renders
  useEffect(() => {
    if (!posts || posts.length === 0) return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [posts]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Nyheder</h1>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Forsiden
        </Link>
      </div>

      {(!posts || posts.length === 0) && (
        <p className="text-sm text-muted-foreground">Ingen nyheder lige nu.</p>
      )}

      <section className="space-y-4">
        {posts?.map((post) => (
          <article
            id={`post-${post.id}`}
            key={post.id}
            className="overflow-hidden rounded-xl border border-primary/30 bg-card scroll-mt-20"
          >
            <div className="space-y-3 p-4 sm:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Nyhed
              </p>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{post.title}</h2>
              {post.body && (
                <div
                  className="prose-news text-sm text-foreground/90"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }}
                />
              )}
            </div>
            {post.image_path && imageMap?.[post.image_path] && (
              <div className="relative max-h-96 w-full overflow-hidden">
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
    </div>
  );
}
