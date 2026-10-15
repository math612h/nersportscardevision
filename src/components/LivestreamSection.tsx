import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Radio, Youtube } from "lucide-react";
import { getLiveStatus, type LiveStatus } from "@/lib/broadcast-live.functions";

export function useLiveStatus() {
  const fetchStatus = useServerFn(getLiveStatus);
  const { data } = useQuery({
    queryKey: ["broadcast-live-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return data;
}

export function LivestreamSection({ status, mode }: { status: LiveStatus | undefined; mode: "live" | "last" }) {
  const useManual = mode === "last" && status?.manualEnabled && !!status?.manualVideoId;
  const videoId = mode === "live" ? status?.videoId : useManual ? status?.manualVideoId : status?.lastVideoId;
  const title = mode === "live" ? status?.title : useManual ? status?.manualTitle : status?.lastTitle;
  if (mode === "live" && !status?.isLive) return null;
  if (!videoId) return null;

  const heading =
    mode === "live" ? (
      <>
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <Radio className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Live nu</h2>
      </>
    ) : useManual ? (
      <>
        <Youtube className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Livestream</h2>
      </>
    ) : (
      <>
        <Youtube className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Seneste livestream</h2>
      </>
    );

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-primary">{heading}</div>
      <article className="overflow-hidden rounded-xl border border-border bg-card">
        {mode === "live" || useManual ? (
          <div className="aspect-video w-full bg-muted">
            <iframe
              src={
                mode === "live"
                  ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`
                  : `https://www.youtube.com/embed/${videoId}`
              }
              title={title ?? "LMU Danmark livestream"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="eager"
            />
          </div>
        ) : (
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block aspect-video w-full bg-muted"
          >
            <img
              src={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.includes("hqdefault")) img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
              }}
              alt={title ?? "LMU Danmark livestream"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/40">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition group-hover:scale-105">
                <Youtube className="h-7 w-7" />
              </span>
            </span>
          </a>
        )}
        <div className="flex items-center justify-between gap-3 p-4">
          {title ? <p className="text-sm font-semibold">{title}</p> : <span />}
          {useManual && (
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              Se på YouTube <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </article>
    </section>
  );
}
