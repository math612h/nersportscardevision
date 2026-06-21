import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";

export const Route = createFileRoute("/_authenticated/_admin")({
  component: AdminGate,
});

function AdminGate() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user && !isAdmin) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);
  if (loading) return <p className="text-muted-foreground">Indlæser…</p>;
  if (!user) return null;
  if (!isAdmin) return <p>Ingen adgang.</p>;

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-3.5rem)] w-full">
        <AdminSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex h-10 items-center border-b border-border bg-background/50 px-2">
            <SidebarTrigger />
            <span className="ml-2 text-xs text-muted-foreground">Kontrolpanel</span>
          </div>
          <main className="flex-1 p-4">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
