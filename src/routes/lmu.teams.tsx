import { createFileRoute } from "@tanstack/react-router";
import { TeamsHub } from "@/components/TeamsHub";

export const Route = createFileRoute("/lmu/teams")({
  head: () => ({
    meta: [
      { title: "Teams – DanishEnduranceSeries.dk" },
      { name: "description", content: "Find LMU-teams, opret eller ansøg." },
      { property: "og:title", content: "Teams – DanishEnduranceSeries.dk" },
    ],
  }),
  component: TeamsHubPage,
});

function TeamsHubPage() {
  return (
    <div className="space-y-6">
      <TeamsHub headerLabel="Teams" />
    </div>
  );
}
