import { createFileRoute } from "@tanstack/react-router";
import { TeamsHub } from "@/components/TeamsHub";

export const Route = createFileRoute("/lmu/teams")({
  head: () => ({
    meta: [
      { title: "Teams – LMU Danmark" },
      { name: "description", content: "Find LMU-teams, opret eller ansøg." },
      { property: "og:title", content: "Teams – LMU Danmark" },
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
