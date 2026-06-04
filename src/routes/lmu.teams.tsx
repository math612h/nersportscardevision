import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TeamsHub } from "@/components/TeamsHub";

export const Route = createFileRoute("/lmu/teams")({
  head: () => ({
    meta: [
      { title: "Teams Hub – DanishEnduranceSeries.dk" },
      { name: "description", content: "Find LMU-teams, opret eller ansøg." },
      { property: "og:title", content: "Teams Hub – DanishEnduranceSeries.dk" },
    ],
  }),
  component: TeamsHubPage,
});

function TeamsHubPage() {
  return (
    <div className="space-y-6">
      <Link to="/lmu" className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> LMU hub
      </Link>
      <TeamsHub headerLabel="Teams Hub" />
    </div>
  );
}
