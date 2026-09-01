import { Link, useRouterState } from "@tanstack/react-router";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Megaphone,
  UserCheck,
  Users,
  Flag,
  Shield,
  ShieldCheck,
  MessageSquareWarning,
  Newspaper,
  MessageCircle,
  History,
  Clock,
  FolderOpen,
  Gauge,
  Headphones,
  AlertTriangle,
  KeyRound,
  Handshake,
  GraduationCap,
  BookOpen,
  Video,
  Coffee,
  Receipt,
  MessageSquare,
  BarChart3,
  Radio,
  MonitorPlay,
  Wifi,


  CalendarDays,
}  from "lucide-react";
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
  const { state, setOpen, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const handleItemClick = () => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };

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
        { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
        { title: "Online nu", url: "/admin/online", icon: Wifi },
      ],
    },
    {
      label: "Brugere",
      items: [
        { title: "Afventer godkendelse", url: "/admin/afventer", icon: UserCheck, badge: pendingCount },
        { title: "Alle brugere", url: "/admin/brugere", icon: Users },
        { title: "Donationer", url: "/admin/donationer", icon: Coffee },
        { title: "Betalinger", url: "/admin/betalinger", icon: Receipt },
        { title: "Gæstekoder", url: "/admin/gaester", icon: KeyRound },
        { title: "Roller", url: "/admin/roller", icon: ShieldCheck },
      ],
    },

    {
      label: "Racing",
      items: [
        { title: "Ligaer & afdelinger", url: "/admin/ligaer", icon: Flag },
        { title: "Regelsæt-arkiv", url: "/admin/regelsaet", icon: BookOpen },
        { title: "Pro/Am tempo", url: "/admin/pace-sammenligning", icon: Gauge },
        { title: "Protester", url: "/admin/protests", icon: MessageSquareWarning, badge: openProtestsCount },
        { title: "Teams", url: "/teams", icon: Shield },
        { title: "Coaches", url: "/admin/coaches", icon: GraduationCap },
        { title: "Coaching bookinger", url: "/admin/coaching-bookings", icon: CalendarDays },
      ],
    },
    {
      label: "Kommunikation",
      items: [
        { title: "Nyhedsbrev", url: "/admin/nyhedsbrev", icon: Newspaper },
        { title: "Ugens Overhaling", url: "/admin/overhalinger", icon: Video },
        { title: "Partnerfordele", url: "/admin/partnerfordele", icon: Handshake },
        { title: "Sponsorer", url: "/admin/sponsorer", icon: Megaphone },
        { title: "Besked Hub", url: "/admin/beskeder", icon: MessageCircle },
        { title: "Briefing-rum", url: "/admin/briefing", icon: Headphones },
        { title: "Feedback & undersøgelser", url: "/admin/feedback", icon: MessageSquare },
      ],
    },
    {
      label: "Broadcast",
      items: [
        { title: "Streaming profil", url: "/admin/streaming-profil", icon: Radio },
        { title: "Streaming tool", url: "/admin/streaming-tool", icon: MonitorPlay },
      ],
    },
    {

      label: "System",
      items: [
        { title: "Audit log", url: "/admin/audit", icon: History },
        { title: "Cron-jobs", url: "/admin/cron", icon: Clock },
        { title: "Storage", url: "/admin/storage", icon: FolderOpen },
        { title: "Fejlmeddelelser", url: "/admin/fejl", icon: AlertTriangle },
      ],
    },
  ];

  const isActive = (url: string, exact?: boolean) =>
    exact ? currentPath === url : currentPath === url || currentPath.startsWith(url + "/");

  return (
    <Sidebar collapsible="offcanvas" className="top-14 h-[calc(100vh-3.5rem)]">
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
