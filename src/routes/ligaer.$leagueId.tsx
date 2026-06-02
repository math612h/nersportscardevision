import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/ligaer/$leagueId")({
  component: () => <Outlet />,
});
