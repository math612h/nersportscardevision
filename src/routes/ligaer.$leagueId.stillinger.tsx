import { createFileRoute } from "@tanstack/react-router";
import { LeagueDetail } from "./ligaer.$leagueId.index";

export const Route = createFileRoute("/ligaer/$leagueId/stillinger")({
  head: () => ({ meta: [{ title: "Stillinger — LMU Danmark" }, { name: "description", content: "Samlet kører- og teamstilling for ligaen." }, { property: "og:title", content: "Stillinger — LMU Danmark" }, { property: "og:description", content: "Samlet kører- og teamstilling for ligaen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <LeagueDetail view="stillinger" />,
});