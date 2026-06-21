import { Link, useLocation } from "@tanstack/react-router";
import { Flag, Home, Trophy, UserCircle2, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type Item = { to: string; label: string; icon: React.ReactNode; exact?: boolean };

export function MobileBottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  if (location.pathname.startsWith("/admin") || location.pathname.startsWith("/login")) return null;

  const items: Item[] = [
    { to: "/", label: "Forside", icon: <Home className="h-5 w-5" />, exact: true },
    { to: "/lmu/liga", label: "Ligaer", icon: <Flag className="h-5 w-5" /> },
    { to: "/leaderboard", label: "Tider", icon: <Trophy className="h-5 w-5" /> },
    { to: "/brugere", label: "Brugere", icon: <Users className="h-5 w-5" /> },
    { to: user ? "/profil" : "/login", label: user ? "Profil" : "Log ind", icon: <UserCircle2 className="h-5 w-5" /> },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Hovednavigation"
    >
      <ul className="mx-auto grid max-w-6xl grid-cols-5">
        {items.map((item) => (
          <li key={item.to + item.label} className="flex">
            <Link
              to={item.to}
              activeOptions={item.exact ? { exact: true } : undefined}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium"
            >
              {item.icon}
              <span className="leading-none">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
