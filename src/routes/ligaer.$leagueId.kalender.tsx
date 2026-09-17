import { createFileRoute } from "@tanstack/react-router";
import { LeagueDetail } from "./ligaer.$leagueId.index";

export const Route = createFileRoute("/ligaer/$leagueId/kalender")({
  head: () => ({ meta: [{ title: "Kalender — LMU Danmark" }, { name: "description", content: "Afdelinger, serveroplysninger og practice sessions." }, { property: "og:title", content: "Kalender — LMU Danmark" }, { property: "og:description", content: "Afdelinger, serveroplysninger og practice sessions." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <LeagueDetail view="kalender" />,
});