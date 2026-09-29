import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Radio, Youtube } from "lucide-react";
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
  const videoId = mode === "live" ? status?.videoId : status?.lastVideoId;
  const title = mode === "live" ? status?.title : status?.lastTitle;
  if (mode === "live" && !status?.isLive) return null;
  if (!videoId) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        {mode === "live" ? (
          <>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <Radio className="h-4 w-4" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Live nu</h2>
          </>
        ) : (
          <>
            <Youtube className="h-4 w-4" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">Seneste livestream</h2>
          </>
        )}
      </div>
      <article className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="aspect-video w-full bg-muted">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}${mode === "live" ? "?autoplay=1&mute=1" : ""}`}
            title={title ?? "LMU Danmark livestream"}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading={mode === "live" ? "eager" : "lazy"}
          />
        </div>
        {title && <p className="p-4 text-sm font-semibold">{title}</p>}
      </article>
    </section>
  );
}
