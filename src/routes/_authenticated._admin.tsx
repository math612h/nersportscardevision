import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminCommandPalette } from "@/components/AdminCommandPalette";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin")({
  component: AdminGate,
});

function AdminGate() {
  const { user, isAdmin, isSteward, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const stewardAllowed = pathname.startsWith("/admin/protests") || pathname.startsWith("/admin/replays");
  const allowed = isAdmin || (isSteward && stewardAllowed);

  useEffect(() => {
    if (loading || !user) return;
    if (!isAdmin && isSteward && !stewardAllowed) navigate({ to: "/admin/protests" });
    else if (!isAdmin && !isSteward) navigate({ to: "/" });
  }, [loading, user, isAdmin, isSteward, stewardAllowed, navigate]);

  if (loading) return <p className="text-muted-foreground">Indlæser…</p>;
  if (!user) return null;
  if (!allowed) return <p>Ingen adgang.</p>;

  return (
    <SidebarProvider>
      {isAdmin && <AdminCommandPalette />}
      <div className="flex min-h-[calc(100vh-3.5rem)] w-full">
        {isAdmin ? <AdminSidebar /> : null}
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex h-10 items-center gap-2 border-b border-border bg-background/50 px-2">
            {isAdmin && <SidebarTrigger />}
            <span className="text-xs text-muted-foreground">{isAdmin ? "Kontrolpanel" : "Steward"}</span>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 gap-2 text-xs text-muted-foreground"
                onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              >
                <Search className="h-3 w-3" />
                Søg…
                <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
              </Button>
            )}
          </div>
          <main className="flex-1 p-4">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
