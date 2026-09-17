import { createFileRoute } from "@tanstack/react-router";
import { LeagueDetail } from "./ligaer.$leagueId.index";

export const Route = createFileRoute("/ligaer/$leagueId/praemier")({
  head: () => ({ meta: [{ title: "Præmier — LMU Danmark" }, { name: "description", content: "Præmier og kategorier for ligaen." }, { property: "og:title", content: "Præmier — LMU Danmark" }, { property: "og:description", content: "Præmier og kategorier for ligaen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <LeagueDetail view="praemier" />,
});