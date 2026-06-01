import { createFileRoute } from "@tanstack/react-router";
// Reuses the participant /mine-protests view (which already shows all protests for admins).
export { Route as default } from "./_authenticated.mine-protests";

export const Route = createFileRoute("/_authenticated/_admin/admin/protests")({
  component: () => {
    const Mod = require("./_authenticated.mine-protests");
    const C = Mod.Route.options.component;
    return <C />;
  },
});
