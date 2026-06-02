import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import lmuCover from "@/assets/lmu-cover.jpg.asset.json";
import accCover from "@/assets/acc-cover.jpg.asset.json";

export const Route = createFileRoute("/")({
  component: SimPicker,
});

function SimPicker() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vælg simulator</h1>
        <p className="text-sm text-muted-foreground">Hvilken platform kører du på?</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
      className={`group relative overflow-hidden rounded-xl border border-border bg-card transition ${
        disabled ? "opacity-60" : "hover:border-primary hover:shadow-lg cursor-pointer"
      }`}
    >
      <div className="aspect-video w-full overflow-hidden bg-muted">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      </div>
      <div className="flex items-center justify-between p-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {!disabled && (
          <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
        )}
      </div>
    </div>
  );

  if (disabled || !to) return content;
  return <Link to={to}>{content}</Link>;
}
