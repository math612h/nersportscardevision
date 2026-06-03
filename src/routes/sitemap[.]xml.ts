import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE_URL = "https://nersportscardevision.lovable.app";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/lmu", changefreq: "daily", priority: "0.9" },
          { path: "/leaderboard", changefreq: "daily", priority: "0.8" },
        ];

        try {
          const { data: leagues } = await supabaseAdmin
            .from("leagues")
            .select("id, updated_at");
          for (const l of leagues ?? []) {
            entries.push({
              path: `/ligaer/${l.id}`,
              lastmod: (l as any).updated_at ?? undefined,
              changefreq: "weekly",
              priority: "0.7",
            });
            entries.push({
              path: `/ligaer/${l.id}/regler`,
              changefreq: "monthly",
              priority: "0.5",
            });
          }

          const { data: divisions } = await supabaseAdmin
            .from("divisions")
            .select("id, league_id, race_date");
          for (const d of divisions ?? []) {
            entries.push({
              path: `/ligaer/${d.league_id}/afdeling/${d.id}`,
              lastmod: (d as any).race_date ?? undefined,
              changefreq: "weekly",
              priority: "0.6",
            });
          }
        } catch {
          // If DB is unavailable, still return the static entries.
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
