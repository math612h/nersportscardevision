import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Radio, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLiveStatus } from "@/lib/broadcast-live.functions";

export function LiveNowBanner() {
  const fetchStatus = useServerFn(getLiveStatus);
  const { data } = useQuery({
    queryKey: ["broadcast-live-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (!data?.isLive) return null;

  const url = data.videoId
    ? `https://www.youtube.com/watch?v=${data.videoId}`
    : "https://www.youtube.com/channel/UCJUbwNmuLUXybJlUzJZbPjg/live";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/50 bg-primary/10 px-4 py-3">
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Radio className="h-3.5 w-3.5" /> Live nu
        </p>
        <p className="truncate text-sm font-medium">
          {data.title ?? "LMU Danmark sender live på YouTube"}
        </p>
      </div>
      <Button asChild size="sm" className="gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer">
          Se streamen <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>
    </div>
  );
}
