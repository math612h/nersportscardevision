import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Flag, Gauge, Home, LayoutGrid, LogOut, Shield, User as UserIcon, UserCircle2, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";


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
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {!isAdminRoute && (
            <Link to="/" className="rounded px-2 py-1 hover:bg-accent" activeOptions={{ exact: true }}>
              <span className="flex items-center gap-1"><Home className="h-4 w-4" /> Forside</span>
            </Link>
          )}
          {!isAdminRoute && (
            <Link to="/teams" className="hidden sm:flex items-center gap-1 rounded px-2 py-1 hover:bg-accent">
              <Shield className="h-4 w-4" /> Teams
            </Link>
          )}
          {!isAdminRoute && (
            <Link to="/brugere" className="hidden sm:flex items-center gap-1 rounded px-2 py-1 hover:bg-accent">
              <Users className="h-4 w-4" /> Brugere
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
              <NotificationsBell />
              <Link to="/profil" className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent" title="Min profil" aria-label="Min profil">
                <UserCircle2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Profil</span>
              </Link>
              <div className="ml-1 hidden items-center gap-1 px-2 text-xs text-muted-foreground sm:flex">
                <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="max-w-[140px] truncate">{user.email}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={signOut} title="Log ud" aria-label="Log ud">
                <LogOut className="h-4 w-4" aria-hidden="true" />
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
