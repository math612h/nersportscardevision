import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Flag, Gauge, Home, LayoutGrid, LogOut, Menu, Shield, Trophy, User as UserIcon, UserCircle2, Users } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useProfileComplete } from "@/hooks/use-profile-complete";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logoAsset from "@/assets/lmu-logo.png.asset.json";


export function AppHeader() {
  const { user, isAdmin, signOut, loading } = useAuth();
  const { complete: profileComplete, signedIn } = useProfileComplete();
  const gated = signedIn && !profileComplete;
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { to: string; label: string; icon: React.ReactNode; show: boolean; exact?: boolean; highlight?: boolean }[] = [
    { to: "/", label: "Forside", icon: <Home className="h-4 w-4" />, show: !isAdminRoute, exact: true },
    { to: "/lmu/liga", label: "Ligaer", icon: <Flag className="h-4 w-4" />, show: !isAdminRoute },
    { to: "/leaderboard", label: "Leaderboard", icon: <Trophy className="h-4 w-4" />, show: !isAdminRoute },
    { to: "/teams", label: "Teams", icon: <Shield className="h-4 w-4" />, show: !isAdminRoute },
    { to: "/brugere", label: "Brugere", icon: <Users className="h-4 w-4" />, show: !isAdminRoute },
    { to: "/", label: "Deltagerside", icon: <LayoutGrid className="h-4 w-4" />, show: !!isAdmin && isAdminRoute },
    { to: "/admin", label: "Kontrolpanel", icon: <Gauge className="h-4 w-4" />, show: !!isAdmin && !isAdminRoute, highlight: true },
  ];

  const visibleItems = navItems.filter((i) => i.show && (!gated || (i.to === "/" && i.exact)));

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-2 sm:px-4">
        {/* Mobile menu button */}
        <div className="sm:hidden">
          <DropdownMenu open={mobileOpen} onOpenChange={setMobileOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Åbn menu">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {visibleItems.map((item, idx) => (
                <DropdownMenuItem key={idx} asChild>
                  <Link
                    to={item.to}
                    activeOptions={item.exact ? { exact: true } : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={item.highlight ? "text-primary" : ""}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Link to="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight" aria-label="LMU Danmark – forside">
          <img src={logoAsset.url} alt="LMU Danmark" className="h-8 w-8 object-contain" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm sm:flex">
          {visibleItems.map((item, idx) => (
            <Link
              key={idx}
              to={item.to}
              activeOptions={item.exact ? { exact: true } : undefined}
              className={`flex shrink-0 items-center gap-1 rounded px-2 py-1 ${
                item.highlight ? "bg-primary/10 text-primary hover:bg-primary/20" : "hover:bg-accent"
              }`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>

        {/* Spacer for mobile to push right items to the end */}
        <div className="flex-1 sm:hidden" />

        <div className="flex shrink-0 items-center gap-1">
          {user ? (
            <>
              <NotificationsBell />
              <Link to="/profil" className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent" title="Min profil" aria-label="Min profil">
                <UserCircle2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Profil</span>
              </Link>
              <div className="ml-1 hidden items-center gap-1 px-2 text-xs text-muted-foreground lg:flex">
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
        </div>
      </div>
    </header>
  );
}
