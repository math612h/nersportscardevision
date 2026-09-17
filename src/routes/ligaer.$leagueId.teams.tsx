import { createFileRoute } from "@tanstack/react-router";
import { LeagueDetail } from "./ligaer.$leagueId.index";

export const Route = createFileRoute("/ligaer/$leagueId/teams")({
  head: () => ({ meta: [{ title: "Teams — LMU Danmark" }, { name: "description", content: "Teamoversigt og lineups for ligaen." }, { property: "og:title", content: "Teams — LMU Danmark" }, { property: "og:description", content: "Teamoversigt og lineups for ligaen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <LeagueDetail view="teams" />,
});