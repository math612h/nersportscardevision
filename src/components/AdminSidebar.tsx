import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  UserCheck,
  Users,
  Flag,
  Shield,
  MessageSquareWarning,
  Newspaper,
  MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

type Item = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
  exact?: boolean;
};

type Section = { label: string; items: Item[] };

export function AdminSidebar() {
  const { state, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const handleItemClick = () => setOpen(false);

  const { data: pendingCount } = useQuery({
    queryKey: ["admin-pending-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("approved", false);
      return count ?? 0;
    },
  });

  const { data: openProtestsCount } = useQuery({
    queryKey: ["admin-open-protests-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("protests")
        .select("id", { count: "exact", head: true })
        .neq("status", "ruled");
      return count ?? 0;
    },
  });

  const sections: Section[] = [
    {
      label: "Oversigt",
      items: [
        { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
      ],
    },
    {
      label: "Brugere",
      items: [
        { title: "Afventer godkendelse", url: "/admin/afventer", icon: UserCheck, badge: pendingCount },
        { title: "Alle brugere", url: "/admin/brugere", icon: Users },
      ],
    },
    {
      label: "Racing",
      items: [
        { title: "Ligaer & afdelinger", url: "/admin/ligaer", icon: Flag },
        { title: "Protester", url: "/admin/protests", icon: MessageSquareWarning, badge: openProtestsCount },
        { title: "Teams", url: "/teams", icon: Shield },
      ],
    },
    {
      label: "Kommunikation",
      items: [
        { title: "Nyhedsbrev", url: "/admin/nyhedsbrev", icon: Newspaper },
        { title: "Besked Hub", url: "/admin/beskeder", icon: MessageCircle },
      ],
    },
  ];

  const isActive = (url: string, exact?: boolean) =>
    exact ? currentPath === url : currentPath === url || currentPath.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            {!collapsed && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isActive(item.url, item.exact);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link to={item.url} className="flex items-center gap-2" onClick={handleItemClick}>
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate">{item.title}</span>
                              {item.badge != null && item.badge > 0 && (
                                <Badge variant="destructive" className="ml-auto">
                                  {item.badge}
                                </Badge>
                              )}
                            </>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
