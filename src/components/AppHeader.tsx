import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Flag, Gauge, LayoutGrid, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { user, isAdmin, signOut, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith("/admin");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
          <Flag className="h-5 w-5 text-primary" />
          <span>LMU-Hub</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {!isAdminRoute && (
            <Link to="/" className="rounded px-2 py-1 hover:bg-accent" activeOptions={{ exact: true }}>
              <span className="flex items-center gap-1"><LayoutGrid className="h-4 w-4" /> Ligaer</span>
            </Link>
          )}
          {user && !isAdminRoute && (
            <Link to="/mine-protests" className="rounded px-2 py-1 hover:bg-accent">
              Protests
            </Link>
          )}
          {isAdmin && isAdminRoute && (
            <Link to="/" className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent">
              <LayoutGrid className="h-4 w-4" /> Deltagerside
            </Link>
          )}
          {isAdmin && !isAdminRoute && (
            <Link to="/admin" className="flex items-center gap-1 rounded px-2 py-1 bg-primary/10 text-primary hover:bg-primary/20">
              <Gauge className="h-4 w-4" /> Kontrolpanel
            </Link>
          )}
          {user ? (
            <>
              <div className="ml-2 hidden items-center gap-1 px-2 text-xs text-muted-foreground sm:flex">
                <UserIcon className="h-3.5 w-3.5" />
                <span className="max-w-[140px] truncate">{user.email}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={signOut} title="Log ud">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            !loading && (
              <Button size="sm" onClick={() => navigate({ to: "/login" })}>
                Log ind
              </Button>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
