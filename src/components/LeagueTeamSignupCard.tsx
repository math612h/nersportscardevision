import { useEffect, useMemo, useState } from "react";
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


type League = { id: string; name: string; class_configs: any };
type Member = { user_id: string; display_name: string | null; car_class: string | null };

export function LeagueTeamSignupCard({
  teamId,
  members,
}: {
  teamId: string;
  members: Member[];
}) {
  const { isGuest } = useAuth();
  const qc = useQueryClient();
  const submitFn = useServerFn(submitTeamForLeague);
  const withdrawFn = useServerFn(withdrawTeamFromLeague);

  const { data: leagues } = useQuery({
    queryKey: ["leagues-published", "teams-allowed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("id, name, published, teams_allowed, class_configs")
        .eq("published", true)
        .eq("teams_allowed", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as League[];
    },
  });

  const { data: entries, refetch } = useQuery({
    queryKey: ["team-league-entries", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("league_team_entries")
        .select(
          "id, league_id, car_class, status, leagues:league_id(name), league_team_lineup(id, user_id, status)",
        )
        .eq("team_id", teamId)
        .neq("status", "withdrawn");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        league_id: string;
        car_class: string;
        status: string;
        leagues: { name: string } | null;
        league_team_lineup: Array<{ id: string; user_id: string; status: string }>;
      }>;
    },
  });

  const [open, setOpen] = useState(false);
  const [leagueId, setLeagueId] = useState<string>("");
  const [carClass, setCarClass] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const memberIds = useMemo(() => members.map((m) => m.user_id), [members]);

  // Load all entries for picked league across team members
  const { data: memberEntries } = useQuery({
    queryKey: ["team-member-entries", leagueId, memberIds],
    enabled: !!leagueId && memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("entries")
        .select("user_id, car_class")
        .eq("league_id", leagueId)
        .in("user_id", memberIds);
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; car_class: string }>;
    },
  });

  const selectedLeague = (leagues ?? []).find((l) => l.id === leagueId);
  const leagueClasses = useMemo(() => {
    const cfgs = Array.isArray(selectedLeague?.class_configs)
      ? (selectedLeague!.class_configs as any[])
      : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of cfgs) {
      const cc = c?.car_class as string | undefined;
      if (cc && !seen.has(cc)) {
        seen.add(cc);
        out.push(cc);
      }
    }
    return out;
  }, [selectedLeague]);

  // Reset class + selection when league changes
  useEffect(() => {
    setCarClass("");
    setSelected(new Set());
  }, [leagueId]);

  // Eligible members for the picked (league, class):
  // must (a) be assigned to this class in the team AND (b) be signed up in the league for this class.
  const eligibleByMember = useMemo(() => {
    const m = new Map<string, boolean>();
    if (!carClass) return m;
    const enrolled = new Set(
      (memberEntries ?? []).filter((e) => e.car_class === carClass).map((e) => e.user_id),
    );
    const classMembers = new Set(
      members.filter((mem) => mem.car_class === carClass).map((mem) => mem.user_id),
    );
    for (const id of memberIds) m.set(id, enrolled.has(id) && classMembers.has(id));
    return m;
  }, [memberEntries, carClass, memberIds, members]);

  const membersWithClassCount = useMemo(
    () => (carClass ? members.filter((m) => m.car_class === carClass).length : 0),
    [members, carClass],
  );

  // Drop ineligible from selection on class change
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (eligibleByMember.get(id)) next.add(id);
      });
      return next;
    });
  }, [eligibleByMember]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!leagueId) throw new Error("Vælg en liga");
      if (!carClass) throw new Error("Vælg en bilklasse");
      const userIds = Array.from(selected);
      return await submitFn({
        data: { leagueId, teamId, carClass, userIds },
      });
    },
    onSuccess: () => {
      toast.success("Lineup sendt — kørerne får en Discord-besked");
      setOpen(false);
      setLeagueId("");
      setCarClass("");
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

  // A (league, class) combo is "taken" when an active (non-withdrawn) entry exists
  const takenCombos = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries ?? []) s.add(`${e.league_id}:${e.car_class}`);
    return s;
  }, [entries]);

  const availableLeagues = (leagues ?? []).filter((l) => {
    const cfgs = Array.isArray(l.class_configs) ? (l.class_configs as any[]) : [];
    const classes = new Set(cfgs.map((c) => c?.car_class).filter(Boolean));
    if (classes.size === 0) return false;
    // at least one class not yet taken for this team
    for (const cc of classes) {
      if (!takenCombos.has(`${l.id}:${cc}`)) return true;
    }
    return false;
  });

  const availableClasses = leagueClasses.filter(
    (cc) => !takenCombos.has(`${leagueId}:${cc}`),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4" /> Team-tilmeldinger
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={isGuest || availableLeagues.length === 0} title={isGuest ? "Gæstebrugere kan ikke tilmelde teams" : undefined}>
              {isGuest ? "Kun for kørere" : "Tilmeld team i liga"}
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
              <div className="space-y-1.5">
                <Label>Bilklasse</Label>
                <Select value={carClass} onValueChange={setCarClass} disabled={!leagueId}>
                  <SelectTrigger>
                    <SelectValue placeholder={leagueId ? "Vælg bilklasse…" : "Vælg liga først"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClasses.map((cc) => (
                      <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Begge kørere skal være tildelt {carClass || "klassen"} på team-siden OG selv være tilmeldt klassen i ligaen.
                </p>
              </div>
              {carClass && membersWithClassCount < 2 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
                  Du har kun {membersWithClassCount} medlem{membersWithClassCount === 1 ? "" : "mer"} tildelt <strong>{carClass}</strong> i teamet. Tildel klassen til mindst 2 medlemmer på team-siden før du kan sende et lineup. Eksisterende medlemmer har ingen klasse som standard — du skal selv vælge.
                </div>
              )}
              <div className="space-y-2">
                <Label>Lineup (mindst 2 kørere)</Label>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {members.map((m) => {
                    const eligible = eligibleByMember.get(m.user_id) ?? false;
                    const checked = selected.has(m.user_id);
                    const disabled = !carClass || !eligible;
                    const reason =
                      !carClass
                        ? null
                        : m.car_class !== carClass
                          ? `ikke tildelt ${carClass} i teamet`
                          : !(memberEntries ?? []).some((e) => e.user_id === m.user_id && e.car_class === carClass)
                            ? `ikke selv tilmeldt ${carClass} i ligaen`
                            : null;
                    return (
                      <li
                        key={m.user_id}
                        className={`flex items-center gap-2 px-3 py-2 ${disabled ? "opacity-60" : ""}`}
                      >
                        <Checkbox
                          id={`pick-${m.user_id}`}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(v) => {
                            const next = new Set(selected);
                            if (v) next.add(m.user_id); else next.delete(m.user_id);
                            setSelected(next);
                          }}
                        />
                        <Label
                          htmlFor={`pick-${m.user_id}`}
                          className={`flex-1 text-sm font-normal ${disabled ? "" : "cursor-pointer"}`}
                        >
                          {m.display_name ?? "Uden navn"}
                          {m.car_class && (
                            <span className="ml-2 text-[10px] text-muted-foreground">· {m.car_class}</span>
                          )}
                        </Label>
                        {reason && (
                          <span className="text-[10px] text-muted-foreground">{reason}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground">
                  De valgte kørere får en Discord-DM og kan acceptere/afvise. Når mindst 2 har accepteret bliver tilmeldingen bekræftet. Hvis under 2 lineup-medlemmer deltager i en afdeling, modtager teamet ikke points i klassen for den afdeling.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
              <Button
                onClick={() => submit.mutate()}
                disabled={submit.isPending || !leagueId || !carClass || selected.size < 2}
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
                    <p className="truncate text-sm font-medium">
                      {e.leagues?.name ?? "Ukendt liga"} · {e.car_class}
                    </p>
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
          "id, status, league_team_entries:league_team_entry_id(id, team_id, car_class, leagues:league_id(name))",
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
                Du er valgt til{" "}
                <strong>
                  {inv.league_team_entries?.leagues?.name ?? "ligaen"}
                  {inv.league_team_entries?.car_class
                    ? ` · ${inv.league_team_entries.car_class}`
                    : ""}
                </strong>
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
