import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield, Flag, MessageSquareWarning, Newspaper, Users, UserCheck, Shield as ShieldIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_admin/admin/")({
  component: AdminHub,
});

function AdminHub() {
  const { data: pendingCount } = useQuery({
    queryKey: ["admin-pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("approved", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: openProtestsCount } = useQuery({
    queryKey: ["admin-open-protests-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("protests")
        .select("id", { count: "exact", head: true })
        .neq("status", "ruled");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const items = [
    { to: "/admin/ligaer", title: "Ligaer & afdelinger", desc: "Opret og rediger ligaer, afdelinger, regler og entries.", icon: Flag, badge: null as number | null },
    { to: "/admin/protests", title: "Protests", desc: "Se alle indsendte protests.", icon: MessageSquareWarning, badge: openProtestsCount ?? null },
    { to: "/admin/nyhedsbrev", title: "Nyhedsbrev", desc: "Skriv nyheder der vises på forsiden.", icon: Newspaper, badge: null },
    { to: "/admin/afventer", title: "Afventer godkendelse", desc: "Godkend nye brugere som lige har oprettet en profil.", icon: UserCheck, badge: pendingCount ?? null },
    { to: "/admin/brugere", title: "Brugere", desc: "Administrér godkendte brugere og roller.", icon: Users, badge: null },
    { to: "/teams", title: "Teams", desc: "Se alle teams, opret nyt og administrér medlemmer.", icon: ShieldIcon, badge: null },
  ] as const;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">Admin</h1></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="block">
            <Card className="cursor-pointer transition hover:border-primary">
              <CardHeader>
                <div className="flex items-center gap-2"><i.icon className="h-5 w-5 text-primary" /><CardTitle>{i.title}</CardTitle>{i.badge != null && i.badge > 0 && <Badge variant="destructive" className="ml-auto">{i.badge}</Badge>}</div>
                <CardDescription>{i.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
