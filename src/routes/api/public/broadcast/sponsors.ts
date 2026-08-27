import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export const Route = createFileRoute("/api/public/broadcast/sponsors")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const nowIso = new Date().toISOString();

          const { data: settings, error: settingsErr } = await supabaseAdmin
            .from("sponsor_settings" as any)
            .select("enabled, rotate_seconds, position, show_on_mobile, show_name")
            .eq("id", 1)
            .maybeSingle();
          if (settingsErr) throw settingsErr;

          const { data: rows, error } = await supabaseAdmin
            .from("sponsors" as any)
            .select("id, name, website_url, logo_path, description, sort_order, starts_at, ends_at, active")
            .eq("active", true)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });
          if (error) throw error;

          const active = ((rows ?? []) as any[]).filter(
            (s) => (!s.starts_at || s.starts_at <= nowIso) && (!s.ends_at || s.ends_at >= nowIso),
          );

          const origin = new URL(request.url).origin;
          const logoUrls = new Map<string, string>();
          for (const s of active) {
            if (!s.logo_path) continue;
            logoUrls.set(s.id, `${origin}/api/public/broadcast/storage/sponsor-images/${s.logo_path}`);
          }

          const sponsors = active.map((s) => ({
            id: s.id,
            name: s.name,
            websiteUrl: s.website_url ?? null,
            logoUrl: logoUrls.get(s.id) ?? null,
            description: s.description ?? null,
            sortOrder: s.sort_order ?? 0,
          }));

          return Response.json(
            {
              settings: settings
                ? {
                    enabled: (settings as any).enabled ?? false,
                    rotateSeconds: (settings as any).rotate_seconds ?? 10,
                    position: (settings as any).position ?? "right",
                    showOnMobile: (settings as any).show_on_mobile ?? false,
                    showName: (settings as any).show_name ?? true,
                  }
                : null,
              sponsors,
            },
            { status: 200, headers: CORS },
          );
        } catch (e) {
          console.error("[broadcast/sponsors]", e);
          return Response.json({ error: "Serverfejl" }, { status: 500, headers: CORS });
        }
      },
    },
  },
});
