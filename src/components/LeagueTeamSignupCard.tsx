import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  submitTeamForLeague,
  withdrawTeamFromLeague,
  respondLeagueLineup,
} from "@/lib/league-team-entries.functions";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";


type League = { id: string; name: string };
type Member = { user_id: string; display_name: string | null };

export function LeagueTeamSignupCard({
  teamId,
  members,
}: {
  teamId: string;
  members: Member[];
}) {
  const qc = useQueryClient();
  const submitFn = useServerFn(submitTeamForLeague);
  const withdrawFn = useServerFn(withdrawTeamFromLeague);

  const { data: leagues } = useQuery({
    queryKey: ["leagues-published", "teams-allowed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("id, name, published, is_offseason, teams_allowed")
        .eq("published", true)
        .eq("teams_allowed", true)
        .order("name");
      if (error) throw error;
      return ((data ?? []) as any[]).filter((l) => !l.is_offseason) as League[];
    },
  });

  const { data: entries, refetch } = useQuery({
    queryKey: ["team-league-entries", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("league_team_entries")
        .select(
          "id, league_id, status, leagues:league_id(name), league_team_lineup(id, user_id, status)",
        )
        .eq("team_id", teamId)
        .neq("status", "withdrawn");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        league_id: string;
        status: string;
        leagues: { name: string } | null;
        league_team_lineup: Array<{ id: string; user_id: string; status: string }>;
      }>;
    },
  });

  const enrolledLeagueIds = useMemo(
    () => new Set((entries ?? []).map((e) => e.league_id)),
    [entries],
  );

  const [open, setOpen] = useState(false);
  const [leagueId, setLeagueId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const submit = useMutation({
    mutationFn: async () => {
      if (!leagueId) throw new Error("Vælg en liga");
      const userIds = Array.from(selected);
      return await submitFn({
        data: { leagueId, teamId, userIds },
      });
    },
    onSuccess: () => {
      toast.success("Lineup sendt — kørerne får en Discord-besked");
      setOpen(false);
      setLeagueId("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["team-league-entries", teamId] });
      refetch();
    },
    onError: (e) => toastError((e as Error).message),
  });

  const memberById = useMemo(() => {
    const m = new Map<string, Member>();
    for (const x of members) m.set(x.user_id, x);
    return m;
  }, [members]);

  const availableLeagues = (leagues ?? []).filter((l) => !enrolledLeagueIds.has(l.id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4" /> Team-tilmeldinger
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={availableLeagues.length === 0}>
              Tilmeld team i liga
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tilmeld team i liga</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Liga</Label>
                <Select value={leagueId} onValueChange={setLeagueId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vælg liga…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLeagues.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lineup (mindst 2 kørere)</Label>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {members.map((m) => {
                    const checked = selected.has(m.user_id);
                    return (
                      <li key={m.user_id} className="flex items-center gap-2 px-3 py-2">
                        <Checkbox
                          id={`pick-${m.user_id}`}
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = new Set(selected);
                            if (v) next.add(m.user_id); else next.delete(m.user_id);
                            setSelected(next);
                          }}
                        />
                        <Label htmlFor={`pick-${m.user_id}`} className="flex-1 cursor-pointer text-sm font-normal">
                          {m.display_name ?? "Uden navn"}
                        </Label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground">
                  De valgte kørere får en Discord-DM og kan acceptere/afvise. Når alle har accepteret bliver tilmeldingen bekræftet.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
              <Button
                onClick={() => submit.mutate()}
                disabled={submit.isPending || !leagueId || selected.size < 2}
              >
                {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send invitationer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {(entries ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Teamet er ikke tilmeldt nogen liga endnu.</p>
        ) : (
          <ul className="space-y-2">
            {(entries ?? []).map((e) => {
              const accepted = e.league_team_lineup.filter((l) => l.status === "accepted").length;
              const invited = e.league_team_lineup.filter((l) => l.status === "invited").length;
              const declined = e.league_team_lineup.filter((l) => l.status === "declined").length;
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.leagues?.name ?? "Ukendt liga"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {accepted} accepteret · {invited} afventer · {declined} afvist
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={e.status === "confirmed" ? "default" : "secondary"} className="text-[10px]">
                      {e.status === "confirmed" ? "Bekræftet" : "Afventer"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      title="Træk tilmelding tilbage"
                      onClick={async () => {
                        if (!confirm("Træk tilmelding tilbage?")) return;
                        try {
                          await withdrawFn({ data: { entryId: e.id } });
                          toast.success("Tilmelding trukket tilbage");
                          qc.invalidateQueries({ queryKey: ["team-league-entries", teamId] });
                        } catch (err) {
                          toastError((err as Error).message);
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* per-driver status */}
                  <ul className="basis-full space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    {e.league_team_lineup.map((l) => {
                      const name = memberById.get(l.user_id)?.display_name ?? "Ukendt";
                      const icon = l.status === "accepted" ? "✅" : l.status === "declined" ? "❌" : "⏳";
                      return (
                        <li key={l.id}>{icon} {name} <span className="opacity-60">— {l.status}</span></li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function MyLineupInvitations({ teamId }: { teamId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const respondFn = useServerFn(respondLeagueLineup);

  const { data: invites } = useQuery({
    queryKey: ["my-lineup-invites", user?.id, teamId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("league_team_lineup")
        .select(
          "id, status, league_team_entries:league_team_entry_id(id, team_id, leagues:league_id(name))",
        )
        .eq("user_id", user!.id)
        .eq("status", "invited");
      if (error) throw error;
      return ((data ?? []) as any[]).filter(
        (r) => r.league_team_entries?.team_id === teamId,
      );
    },
  });

  const respond = useMutation({
    mutationFn: async (v: { lineupId: string; action: "accept" | "decline" }) =>
      await respondFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.action === "accept" ? "Accepteret" : "Afvist");
      qc.invalidateQueries({ queryKey: ["my-lineup-invites"] });
      qc.invalidateQueries({ queryKey: ["team-league-entries", teamId] });
    },
    onError: (e) => toastError((e as Error).message),
  });

  if (!invites || invites.length === 0) return null;

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Lineup-invitationer til dig</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
            >
              <p className="text-sm">
                Du er valgt til <strong>{inv.league_team_entries?.leagues?.name ?? "ligaen"}</strong>
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => respond.mutate({ lineupId: inv.id, action: "decline" })}
                  disabled={respond.isPending}
                >
                  <X className="h-4 w-4" /> Afvis
                </Button>
                <Button
                  size="sm"
                  onClick={() => respond.mutate({ lineupId: inv.id, action: "accept" })}
                  disabled={respond.isPending}
                >
                  <Check className="h-4 w-4" /> Accepter
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
