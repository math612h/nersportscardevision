import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Flag, Shield } from "lucide-react";

const PAGE_TITLE = "LMU – vælg hub – LMU-Hub";
const PAGE_DESC = "Vælg Liga Hub for ligaer og løb, eller Teams Hub for hold-fællesskab.";
const PAGE_URL = "https://nersportscardevision.lovable.app/lmu";

export const Route = createFileRoute("/lmu/")({
  component: LmuHubPicker,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:url", content: PAGE_URL },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
});

function LmuHubPicker() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Le Mans Ultimate</p>
        <h1 className="text-2xl font-bold tracking-tight">Vælg hub</h1>
        <p className="text-sm text-muted-foreground">Hvor vil du hen?</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <HubCard
          to="/lmu/liga"
          title="Liga Hub"
          subtitle="Ligaer, off-season løb, stillinger og regler"
          icon={<Flag className="h-5 w-5" />}
        />
        <HubCard
          to="/lmu/teams"
          title="Teams Hub"
          subtitle="Find teams, søg, opret eller ansøg"
          icon={<Shield className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}

function HubCard({ to, title, subtitle, icon }: { to: string; title: string; subtitle: string; icon: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-5 transition hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
    >
      <div className="flex items-start justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">{icon}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition group-hover:bg-primary group-hover:text-primary-foreground">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </Link>
  );
}
