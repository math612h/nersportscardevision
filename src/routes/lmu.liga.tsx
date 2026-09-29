import { createFileRoute, redirect } from "@tanstack/react-router";
import { getActiveLeague } from "@/lib/active-league.functions";

// Liga-oversigten er fjernet — send videre til den aktive liga (eller forsiden).
export const Route = createFileRoute("/lmu/liga")({
  beforeLoad: async () => {
    const active = await getActiveLeague().catch(() => null);
    if (active) throw redirect({ to: "/ligaer/$leagueId", params: { leagueId: active.id }, replace: true });
    throw redirect({ to: "/", replace: true });
  },
  head: () => ({ meta: [{ title: "Liga — LMU Danmark" }, { name: "robots", content: "noindex" }] }),
});
