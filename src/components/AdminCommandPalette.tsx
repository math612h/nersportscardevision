import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, UserCheck, Users, Flag, MessageSquareWarning, Shield,
  Newspaper, MessageCircle, History, Clock, FolderOpen, Headphones,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { label: string; to: string; icon: React.ComponentType<{ className?: string }>; keywords?: string };

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard },
  { label: "Afventer godkendelse", to: "/admin/afventer", icon: UserCheck },
  { label: "Alle brugere", to: "/admin/brugere", icon: Users },
  { label: "Ligaer & afdelinger", to: "/admin/ligaer", icon: Flag },
  { label: "Protester", to: "/admin/protests", icon: MessageSquareWarning },
  { label: "Teams", to: "/teams", icon: Shield },
  { label: "Nyhedsbrev", to: "/admin/nyhedsbrev", icon: Newspaper },
  { label: "Besked Hub", to: "/admin/beskeder", icon: MessageCircle },
  { label: "Audit log", to: "/admin/audit", icon: History },
  { label: "Cron-jobs", to: "/admin/cron", icon: Clock },
  { label: "Storage", to: "/admin/storage", icon: FolderOpen },
  { label: "Briefing-rum", to: "/admin/briefing", icon: Headphones },
];

export function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: users = [] } = useQuery({
    queryKey: ["cmdk-users", query],
    enabled: open && query.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, lmu_name")
        .or(`display_name.ilike.%${query}%,lmu_name.ilike.%${query}%`)
        .limit(8);
      return data ?? [];
    },
  });

  const { data: leagues = [] } = useQuery({
    queryKey: ["cmdk-leagues", query],
    enabled: open && query.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("leagues").select("id, name").ilike("name", `%${query}%`).limit(6);
      return data ?? [];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["cmdk-teams", query],
    enabled: open && query.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams").select("id, name").ilike("name", `%${query}%`).limit(6);
      return data ?? [];
    },
  });

  const go = (to: string) => { setOpen(false); navigate({ to }); };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Søg sider, brugere, ligaer, teams… (⌘K)" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>Ingen resultater.</CommandEmpty>
        <CommandGroup heading="Sider">
          {NAV.map((n) => (
            <CommandItem key={n.to} onSelect={() => go(n.to)} value={`${n.label} ${n.to}`}>
              <n.icon className="h-4 w-4 mr-2" />{n.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {users.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Brugere">
              {users.map((u: any) => (
                <CommandItem key={u.id} onSelect={() => go(`/profil/${u.id}`)} value={`user-${u.display_name}-${u.lmu_name}`}>
                  <Users className="h-4 w-4 mr-2" />
                  {u.display_name ?? "(uden navn)"}
                  {u.lmu_name && <span className="ml-2 text-xs text-muted-foreground">{u.lmu_name}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {leagues.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Ligaer">
              {leagues.map((l: any) => (
                <CommandItem key={l.id} onSelect={() => go(`/admin/ligaer/${l.id}/afdelinger`)} value={`league-${l.name}`}>
                  <Flag className="h-4 w-4 mr-2" />{l.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {teams.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Teams">
              {teams.map((t: any) => (
                <CommandItem key={t.id} onSelect={() => go(`/teams/${t.id}`)} value={`team-${t.name}`}>
                  <Shield className="h-4 w-4 mr-2" />{t.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
