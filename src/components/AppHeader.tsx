import { Link } from "@tanstack/react-router";
import { Flag, LogOut, Shield, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { user, isAdmin, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
          <Flag className="h-5 w-5 text-primary" />
          <span>LMU-Hub</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/" className="rounded px-2 py-1 hover:bg-accent" activeOptions={{ exact: true }}>
            Ligaer
          </Link>
          <Link to="/mine-protests" className="rounded px-2 py-1 hover:bg-accent">
            Protests
          </Link>
          {isAdmin && (
            <Link to="/admin" className="flex items-center gap-1 rounded px-2 py-1 text-primary hover:bg-accent">
              <Shield className="h-4 w-4" /> Admin
            </Link>
          )}
          <div className="ml-2 hidden items-center gap-1 px-2 text-xs text-muted-foreground sm:flex">
            <UserIcon className="h-3.5 w-3.5" />
            <span className="max-w-[140px] truncate">{user?.email}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} title="Log ud">
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </header>
  );
}
