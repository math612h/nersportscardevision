import { createFileRoute } from "@tanstack/react-router";
import { LeagueDetail } from "./ligaer.$leagueId.index";

export const Route = createFileRoute("/ligaer/$leagueId/entryliste")({
  head: () => ({ meta: [{ title: "Entryliste — LMU Danmark" }, { name: "description", content: "Kørere, klasser og venteliste for ligaen." }, { property: "og:title", content: "Entryliste — LMU Danmark" }, { property: "og:description", content: "Kørere, klasser og venteliste for ligaen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <LeagueDetail view="entryliste" />,
});