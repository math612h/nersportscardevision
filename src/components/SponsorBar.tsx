import { useEffect, useMemo, useState } from "react";
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
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  const list = sponsors ?? [];
  const rotate = Math.max(3, settings?.rotate_seconds ?? 10);

  useEffect(() => {
    if (list.length < 2) return;
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % list.length);
        setFade(true);
      }, 250);
    }, rotate * 1000);
    return () => clearInterval(id);
  }, [list.length, rotate]);

  if (!settings?.enabled) return null;

  const sideClass = settings.position === "right" ? "right-3" : "left-3";
  const mobileClass = settings.show_on_mobile ? "" : "hidden xl:flex";
  const shellClass = `fixed top-24 z-30 w-88 ${sideClass} ${mobileClass} h-[70vh] max-h-[860px] flex-col items-center justify-center gap-4 rounded-xl p-4 shadow-lg backdrop-blur`;

  if (list.length === 0) {
    return (
      <aside
        className={`${shellClass} border border-dashed border-border bg-card/60`}
        aria-label="Sponsorplads"
      >
        <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sponsor
        </p>
        <div className="flex flex-1 w-full items-center justify-center rounded-lg bg-muted/40 text-[11px] text-muted-foreground">
          Ledig plads
        </div>
        <p className="text-center text-[11px] leading-snug text-muted-foreground">
          Her vises sponsorer, når de er oprettet.
        </p>
      </aside>
    );
  }


  const current = list[index % list.length];
  if (!current) return null;

  const logo = current.logo_path ? images?.[current.logo_path] : undefined;


  const inner = (
    <div
      className={`flex w-full flex-col items-center gap-2 transition-opacity duration-250 ${
        fade ? "opacity-100" : "opacity-0"
      }`}
    >
      {logo ? (
        <img
          src={logo}
          alt={current.name}
          loading="lazy"
          className="max-h-24 w-full rounded object-contain"
        />
      ) : (
        <div className="flex h-16 w-full items-center justify-center rounded bg-muted text-xs font-semibold">
          {current.name}
        </div>
      )}
      {settings.show_name && (
        <span className="line-clamp-2 text-center text-xs font-medium text-foreground">{current.name}</span>
      )}
      {current.description && (
        <span className="line-clamp-3 text-center text-[11px] leading-snug text-muted-foreground">
          {current.description}
        </span>
      )}
      {current.website_url && (
        <span className="inline-flex items-center gap-1 text-[11px] text-primary">
          Besøg <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
    </div>
  );

  return (
    <aside
      className={`${shellClass} border border-border bg-card/90`}
      aria-label="Sponsorer"
    >

      <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Sponsor
      </p>
      {current.website_url ? (
        <a
          href={current.website_url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="block rounded transition-transform hover:scale-[1.02]"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
      {list.length > 1 && (
        <div className="flex items-center justify-center gap-1 pt-1">
          {list.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Vis ${s.name}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-primary" : "bg-muted-foreground/40"}`}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
