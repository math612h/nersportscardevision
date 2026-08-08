import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "sponsor-images";

type Sponsor = {
  id: string;
  name: string;
  website_url: string | null;
  logo_path: string | null;
  description: string | null;
};

type SponsorSettings = {
  enabled: boolean;
  rotate_seconds: number;
  position: string;
  show_on_mobile: boolean;
  show_name: boolean;
};

export function useSponsorSettings() {
  return useQuery({
    queryKey: ["sponsor-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sponsor_settings")
        .select("enabled,rotate_seconds,position,show_on_mobile,show_name")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SponsorSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveSponsors() {
  return useQuery({
    queryKey: ["sponsors-active"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("sponsors")
        .select("id,name,website_url,logo_path,description,starts_at,ends_at")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).filter(
        (s) => (!s.starts_at || s.starts_at <= nowIso) && (!s.ends_at || s.ends_at >= nowIso),
      ) as Sponsor[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSponsorImages(paths: string[]) {
  const key = paths.slice().sort().join(",");
  return useQuery({
    queryKey: ["sponsor-images", key],
    enabled: paths.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 12);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => {
        if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      });
      return m;
    },
  });
}

export function SponsorBar() {
  const location = useLocation();
  const { data: settings } = useSponsorSettings();
  const { data: sponsors } = useActiveSponsors();
  const paths = useMemo(
    () => (sponsors ?? []).map((s) => s.logo_path).filter((p): p is string => !!p),
    [sponsors],
  );
  const { data: images } = useSponsorImages(paths);
  const list = sponsors ?? [];

  if (location.pathname !== "/") return null;
  if (!settings?.enabled) return null;

  const sideClass = settings.position === "right" ? "right-3" : "left-3";
  const mobileClass = settings.show_on_mobile ? "" : "hidden xl:flex";
  const shellClass = `fixed top-24 z-30 w-88 ${sideClass} ${mobileClass} max-h-[80vh] overflow-y-auto flex-col gap-3 rounded-xl p-4 shadow-lg backdrop-blur`;

  if (list.length === 0) {
    return (
      <aside
        className={`${shellClass} border border-dashed border-border bg-card/60`}
        aria-label="Sponsorplads"
      >
        <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sponsor
        </p>
        <div className="flex h-24 w-full items-center justify-center rounded-lg bg-muted/40 text-[11px] text-muted-foreground">
          Ledig plads
        </div>
        <p className="text-center text-[11px] leading-snug text-muted-foreground">
          Her vises sponsorer, når de er oprettet.
        </p>
      </aside>
    );
  }

  const renderSponsor = (s: Sponsor) => {
    const logo = s.logo_path ? images?.[s.logo_path] : undefined;
    const inner = (
      <div className="flex w-full flex-col items-center gap-2">
        {logo ? (
          <img
            src={logo}
            alt={s.name}
            loading="lazy"
            className="max-h-24 w-full rounded object-contain"
          />
        ) : (
          <div className="flex h-16 w-full items-center justify-center rounded bg-muted text-xs font-semibold">
            {s.name}
          </div>
        )}
        {settings.show_name && (
          <span className="line-clamp-2 text-center text-xs font-medium text-foreground">{s.name}</span>
        )}
        {s.description && (
          <span className="line-clamp-3 text-center text-[11px] leading-snug text-muted-foreground">
            {s.description}
          </span>
        )}
        {s.website_url && (
          <span className="inline-flex items-center gap-1 text-[11px] text-primary">
            Besøg <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </div>
    );

    return (
      <li key={s.id} className="w-full border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
        {s.website_url ? (
          <a
            href={s.website_url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="block rounded transition-transform hover:scale-[1.02]"
          >
            {inner}
          </a>
        ) : (
          inner
        )}
      </li>
    );
  };

  return (
    <aside className={`${shellClass} border border-border bg-card/90`} aria-label="Sponsorer">
      <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {list.length > 1 ? "Sponsorer" : "Sponsor"}
      </p>
      <ul className="flex w-full flex-col">{list.map(renderSponsor)}</ul>
    </aside>
  );
}
