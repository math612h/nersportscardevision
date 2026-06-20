import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Shield, Flag, MessageSquareWarning, Newspaper, Users, UserCheck, Shield as ShieldIcon, MessageCircle, AlertTriangle, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { postDiscordWelcomeMessage } from "@/lib/discord-welcome.functions";
import { stripUnverifiedMembers } from "@/lib/discord-strip-unverified.functions";

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

  const { data: membersCount } = useQuery({
    queryKey: ["admin-members-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("approved", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const items = [
    { to: "/admin/ligaer", title: "Ligaer & afdelinger", desc: "Opret og rediger ligaer, afdelinger, regler og entries.", icon: Flag, badge: null as number | null },
    { to: "/admin/protests", title: "Protester", desc: "Se alle indsendte protester.", icon: MessageSquareWarning, badge: openProtestsCount ?? null },
    { to: "/admin/nyhedsbrev", title: "Nyhedsbrev", desc: "Skriv nyheder der vises på forsiden.", icon: Newspaper, badge: null },
    { to: "/admin/afventer", title: "Afventer godkendelse", desc: "Godkend nye brugere som lige har oprettet en profil.", icon: UserCheck, badge: pendingCount ?? null },
    { to: "/admin/brugere", title: "Brugere", desc: `${membersCount ?? 0} godkendte medlemmer. Administrér brugere og roller.`, icon: Users, badge: null },
    { to: "/teams", title: "Teams", desc: "Se alle teams, opret nyt og administrér medlemmer.", icon: ShieldIcon, badge: null },
  ] as const;

  const postWelcome = useServerFn(postDiscordWelcomeMessage);
  const [posting, setPosting] = useState(false);
  const handlePostWelcome = async () => {
    if (posting) return;
    if (!confirm("Poste velkomstbesked med 'Skriv dit navn'-knap i #velkomst?")) return;
    setPosting(true);
    try {
      await postWelcome();
      toast.success("Velkomstbesked sendt til #velkomst.");
    } catch (e) {
      toast.error((e as Error).message || "Kunne ikke sende besked.");
    } finally {
      setPosting(false);
    }
  };

  const stripUnverified = useServerFn(stripUnverifiedMembers);
  const [stripping, setStripping] = useState(false);
  const handleStripUnverified = async () => {
    if (stripping) return;
    if (!confirm("Fjern 'Medlem'-rollen fra alle der ikke har gennemført velkomst-flowet (intet nickname)?")) return;
    setStripping(true);
    try {
      const res = await stripUnverified();
      const errPart = res.errors.length > 0 ? ` · ${res.errors.length} fejl (se console)` : "";
      toast.success(`Scannede ${res.scanned}, fjernede rolle fra ${res.stripped}${errPart}.`);
      if (res.errors.length > 0) console.warn("strip errors:", res.errors);
    } catch (e) {
      toast.error((e as Error).message || "Kunne ikke køre.");
    } finally {
      setStripping(false);
    }
  };

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

      <Collapsible open={roleAdminOpen} onOpenChange={setRoleAdminOpen}>
        <Card className="border-destructive/60">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer select-none">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle className="text-destructive">Rolle administration</CardTitle>
                <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${roleAdminOpen ? "rotate-180" : ""}`} />
              </div>
              <CardDescription>
                Advarsels-område: Handlinger her påvirker Discord-roller direkte. Åbn kun når du ved hvad du gør.
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={handlePostWelcome} disabled={posting}>
                {posting ? "Sender..." : "Post velkomstbesked"}
              </Button>
              <Button onClick={handleStripUnverified} disabled={stripping} variant="outline">
                {stripping ? "Scanner..." : "Fjern rolle fra uverificerede"}
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
