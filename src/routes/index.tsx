import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Lock, Flag } from "lucide-react";
import lmuCover from "@/assets/lmu-cover.jpg.asset.json";
import accCover from "@/assets/acc-cover.jpg.asset.json";

const PAGE_TITLE = "Vælg simulator — DanishEnduranceSeries.dk";
const PAGE_DESC =
  "Vælg simulator og hop ind i DanishEnduranceSeries.dk sim-racing ligaer. Le Mans Ultimate er aktiv; Assetto Corsa Competizione kommer snart.";
const PAGE_URL = "https://danishenduranceseries.dk/";

export const Route = createFileRoute("/")({
  component: SimPicker,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:url", content: PAGE_URL },
    ],
    links: [
      { rel: "canonical", href: PAGE_URL },
      { rel: "preload", as: "image", href: lmuCover.url, fetchpriority: "high" } as any,
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "DanishEnduranceSeries.dk",
          url: "https://danishenduranceseries.dk",
          description:
            "Sim-racing liga-hub til DanishEnduranceSeries.dk med ligaer i Le Mans Ultimate.",
          publisher: {
            "@type": "Organization",
            name: "DanishEnduranceSeries.dk",
          },
        }),
      },
    ],
  }),
});

function SimPicker() {
  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">DanishEnduranceSeries.dk</p>
        <h1 className="text-2xl font-bold tracking-tight">Vælg simulator</h1>
        <p className="text-sm text-muted-foreground">Hvilken platform kører du på?</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <SimCard
          to="/lmu"
          title="Le Mans Ultimate"
          image={lmuCover.url}
          priority
        />
        <SimCard
          title="Assetto Corsa Competizione"
          subtitle="Kommer snart"
          image={accCover.url}
          disabled
        />
      </div>
    </div>
  );
}

function SimCard({
  to,
  title,
  subtitle,
  image,
  disabled,
  priority,
}: {
  to?: string;
  title: string;
  subtitle?: string;
  image: string;
  disabled?: boolean;
  priority?: boolean;
}) {
  const content = (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition ${
        disabled
          ? "opacity-60"
          : "hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
      }`}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        <img
          src={image}
          alt={`${title} cover art`}
          width={1280}
          height={720}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          {...(priority ? { fetchpriority: "high" as any } : {})}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
        <div
          className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur transition ${
            disabled
              ? "bg-background/60 text-muted-foreground"
              : "bg-background/70 text-foreground group-hover:bg-primary group-hover:text-primary-foreground"
          }`}
          aria-hidden="true"
        >
          {disabled ? <Lock className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 pb-4 pt-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary" aria-hidden="true">
          <Flag className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </div>
  );

  if (disabled || !to) return content;
  return (
    <Link to={to} className="block h-full" aria-label={`Åbn ${title}`}>
      {content}
    </Link>
  );
}
