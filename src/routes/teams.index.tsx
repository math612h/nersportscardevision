import { createFileRoute } from "@tanstack/react-router";
import { TeamsHub } from "@/components/TeamsHub";

export const Route = createFileRoute("/teams/")({
  head: () => ({
    meta: [
      { title: "Teams – DanishEnduranceSeries.dk" },
      { name: "description", content: "Se alle teams og deres medlemmer." },
      { property: "og:title", content: "Teams – DanishEnduranceSeries.dk" },
      { property: "og:description", content: "Find teams, deres medlemmer og bios." },
    ],
  }),
  component: () => <TeamsHub />,
});
