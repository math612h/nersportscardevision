import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Lock, Flag } from "lucide-react";
import lmuCover from "@/assets/lmu-cover.jpg.asset.json";
import accCover from "@/assets/acc-cover.jpg.asset.json";

export const Route = createFileRoute("/")({
  component: SimPicker,
});

function SimPicker() {
  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">NER Sportscar Division</p>
        <h1 className="text-2xl font-bold tracking-tight">Vælg simulator</h1>
        <p className="text-sm text-muted-foreground">Hvilken platform kører du på?</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <SimCard
          to="/lmu"
          title="Le Mans Ultimate"
          subtitle="Officielle FIA WEC ligaer"
          image={lmuCover.url}
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
}: {
  to?: string;
  title: string;
  subtitle: string;
  image: string;
  disabled?: boolean;
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
          alt={title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
        <div
          className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur transition ${
            disabled
              ? "bg-background/60 text-muted-foreground"
              : "bg-background/70 text-foreground group-hover:bg-primary group-hover:text-primary-foreground"
          }`}
        >
          {disabled ? <Lock className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 pb-4 pt-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Flag className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );

  if (disabled || !to) return content;
  return (
    <Link to={to} className="block h-full">
      {content}
    </Link>
  );
}
