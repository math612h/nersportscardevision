import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Shield, UserCheck, Users, MessageSquareWarning, AlertTriangle, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { postDiscordWelcomeMessage } from "@/lib/discord-welcome.functions";
import { postHostSessionAnchor } from "@/lib/discord-host-session.functions";
import { stripUnverifiedMembers } from "@/lib/discord-strip-unverified.functions";
import { postOffseasonCalendar } from "@/lib/discord-offseason-calendar.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/")({
  component: AdminHub,
});

function StatCard({ title, value, icon: Icon, hint }: { title: string; value: number | string; icon: React.ComponentType<{ className?: string }>; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{title}</CardDescription>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

function AdminHub() {
  const { data: pendingCount } = useQuery({
    queryKey: ["admin-pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("approved", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: openProtestsCount } = useQuery({
    queryKey: ["admin-open-protests-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("protests").select("id", { count: "exact", head: true }).neq("status", "ruled");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: membersCount } = useQuery({
    queryKey: ["admin-members-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("approved", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const postWelcome = useServerFn(postDiscordWelcomeMessage);
  const [posting, setPosting] = useState(false);
  const handlePostWelcome = async () => {
    if (posting) return;
    if (!confirm("Poste velkomstbesked med 'Skriv dit navn'-knap i #velkomst?")) return;
    setPosting(true);
    try { await postWelcome(); toast.success("Velkomstbesked sendt til #velkomst."); }
    catch (e) { toast.error((e as Error).message || "Kunne ikke sende besked."); }
    finally { setPosting(false); }
  };

  const postHostAnchor = useServerFn(postHostSessionAnchor);
  const [postingHost, setPostingHost] = useState(false);
  const handlePostHostAnchor = async () => {
    if (postingHost) return;
    if (!confirm("Poste 'Del din hosted session'-knap i serverhosting-kanalen?")) return;
    setPostingHost(true);
    try { await postHostAnchor(); toast.success("Hosted session-knap sendt til kanalen."); }
    catch (e) { toast.error((e as Error).message || "Kunne ikke sende besked."); }
    finally { setPostingHost(false); }
  };

  const postOffseason = useServerFn(postOffseasonCalendar);
  const [postingOffseason, setPostingOffseason] = useState(false);
  const [offseasonOpen, setOffseasonOpen] = useState(false);
  const [offseasonLeagueId, setOffseasonLeagueId] = useState<string>("");
  const [offseasonChannelId, setOffseasonChannelId] = useState<string>("1515256915611881573");

  const { data: leagueOptions = [] } = useQuery({
    queryKey: ["admin-leagues-for-calendar"],
    enabled: offseasonOpen,
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("id,name,is_offseason").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const handlePostOffseason = async () => {
    if (postingOffseason) return;
    if (!offseasonLeagueId) return toast.error("Vælg en liga.");
    if (!/^\d{5,25}$/.test(offseasonChannelId.trim())) return toast.error("Ugyldigt kanal-ID.");
    setPostingOffseason(true);
    try {
      const res = await postOffseason({ data: { leagueId: offseasonLeagueId, channelId: offseasonChannelId.trim() } });
      toast.success(`Postede ${res.posted} afdelinger fra ${res.league}.`);
      setOffseasonOpen(false);
    } catch (e) { toast.error((e as Error).message || "Kunne ikke sende besked."); }
    finally { setPostingOffseason(false); }
  };

  const stripUnverified = useServerFn(stripUnverifiedMembers);
  const [stripping, setStripping] = useState(false);
  const [roleAdminOpen, setRoleAdminOpen] = useState(false);
  const handleStripUnverified = async () => {
    if (stripping) return;
    if (!confirm("Fjern 'Medlem'-rollen fra alle der ikke har gennemført velkomst-flowet (intet nickname)?")) return;
    setStripping(true);
    try {
      const res = await stripUnverified();
      const errPart = res.errors.length > 0 ? ` · ${res.errors.length} fejl (se console)` : "";
      toast.success(`Scannede ${res.scanned}, fjernede rolle fra ${res.stripped}${errPart}.`);
      if (res.errors.length > 0) console.warn("strip errors:", res.errors);
    } catch (e) { toast.error((e as Error).message || "Kunne ikke køre."); }
    finally { setStripping(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">Dashboard</h1></div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Afventer godkendelse" value={pendingCount ?? "–"} icon={UserCheck} hint="Nye brugere klar til review" />
        <StatCard title="Åbne protester" value={openProtestsCount ?? "–"} icon={MessageSquareWarning} hint="Ikke afgjorte sager" />
        <StatCard title="Godkendte medlemmer" value={membersCount ?? "–"} icon={Users} hint="Aktive på platformen" />
      </div>

      <Collapsible open={roleAdminOpen} onOpenChange={setRoleAdminOpen}>
        <Card className="border-destructive/60">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer select-none">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle className="text-destructive">Discord & rolle-handlinger</CardTitle>
                <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${roleAdminOpen ? "rotate-180" : ""}`} />
              </div>
              <CardDescription>Advarsels-område: Handlinger her påvirker Discord direkte. Åbn kun når du ved hvad du gør.</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={handlePostWelcome} disabled={posting}>{posting ? "Sender..." : "Post velkomstbesked"}</Button>
              <Button onClick={handlePostHostAnchor} disabled={postingHost} variant="outline">{postingHost ? "Sender..." : "Post hosted session-knap"}</Button>
              <Button onClick={() => setOffseasonOpen(true)} variant="outline">Post liga-kalender</Button>
              <Button onClick={handleStripUnverified} disabled={stripping} variant="outline">{stripping ? "Scanner..." : "Fjern rolle fra uverificerede"}</Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={offseasonOpen} onOpenChange={setOffseasonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post liga-kalender til Discord</DialogTitle>
            <DialogDescription>Vælg liga og kanal. Hver afdeling postes som et embed med banebillede.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Liga</Label>
              <Select value={offseasonLeagueId} onValueChange={setOffseasonLeagueId}>
                <SelectTrigger><SelectValue placeholder="Vælg liga..." /></SelectTrigger>
                <SelectContent>
                  {leagueOptions.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}{l.is_offseason ? " (off-season)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Discord kanal-ID</Label>
              <Input value={offseasonChannelId} onChange={(e) => setOffseasonChannelId(e.target.value)} placeholder="fx 1515256915611881573" inputMode="numeric" />
              <p className="text-xs text-muted-foreground">Højreklik på kanalen i Discord → "Kopiér kanal-ID" (kræver udvikler-tilstand).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOffseasonOpen(false)} disabled={postingOffseason}>Annullér</Button>
            <Button onClick={handlePostOffseason} disabled={postingOffseason}>{postingOffseason ? "Sender..." : "Post kalender"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
