import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin/admin/regelsaet")({
  component: () => <Outlet />,
});
