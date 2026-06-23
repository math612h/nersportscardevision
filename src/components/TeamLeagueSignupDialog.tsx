import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { submitTeamForLeague } from "@/lib/league-team-entries.functions";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type League = { id: string; name: string; class_configs: any };
type Member = { user_id: string; display_name: string | null; car_class: string | null };

export function TeamLeagueSignupDialog({
  teamId,
  trigger,
  initialLeagueId,
}: {
  teamId: string;
  trigger?: React.ReactNode;
  initialLeagueId?: string;
}) {
  const qc = useQueryClient();
  const submitFn = useServerFn(submitTeamForLeague);

  const { data: members } = useQuery({
    queryKey: ["team-members-signup", teamId],
    queryFn: async () => {
      const { data: memberRows, error: mErr } = await (supabase as any)
        .from("team_members")
        .select("user_id, car_class")
        .eq("team_id", teamId);
      if (mErr) throw mErr;
      const ids = ((memberRows ?? []) as any[]).map((m) => m.user_id as string);
      const { data: profileRows, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      if (pErr) throw pErr;
      const names = new Map<string, string | null>();
      ((profileRows ?? []) as any[]).forEach((p) => names.set(p.id, p.display_name ?? null));
      return ((memberRows ?? []) as any[]).map((m) => ({
        user_id: m.user_id as string,
        display_name: names.get(m.user_id) ?? null,
        car_class: (m.car_class as string | null) ?? null,
      })) as Member[];
    },
  });

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
  const [leagueId, setLeagueId] = useState<string>(initialLeagueId ?? "");
  const [carClass, setCarClass] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const memberIds = useMemo(() => (members ?? []).map((m) => m.user_id), [members]);

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

  useEffect(() => {
    setCarClass("");
    setSelected(new Set());
  }, [leagueId]);

  const eligibleByMember = useMemo(() => {
    const m = new Map<string, boolean>();
    if (!carClass) return m;
    const enrolled = new Set(
      (memberEntries ?? []).filter((e) => e.car_class === carClass).map((e) => e.user_id),
    );
    const classMembers = new Set(
      (members ?? []).filter((mem) => mem.car_class === carClass).map((mem) => mem.user_id),
    );
    for (const id of memberIds) m.set(id, enrolled.has(id) && classMembers.has(id));
    return m;
  }, [memberEntries, carClass, memberIds, members]);

  const membersWithClassCount = useMemo(
    () => (carClass ? (members ?? []).filter((m) => m.car_class === carClass).length : 0),
    [members, carClass],
  );

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
      setLeagueId(initialLeagueId ?? "");
      setCarClass("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["team-league-entries", teamId] });
      qc.invalidateQueries({ queryKey: ["league-team-entries-mine"] });
      refetch();
    },
    onError: (e) => toastError((e as Error).message),
  });

  const takenCombos = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries ?? []) s.add(`${e.league_id}:${e.car_class}`);
    return s;
  }, [entries]);

  const availableLeagues = (leagues ?? []).filter((l) => {
    const cfgs = Array.isArray(l.class_configs) ? (l.class_configs as any[]) : [];
    const classes = new Set(cfgs.map((c) => c?.car_class).filter(Boolean));
    if (classes.size === 0) return false;
    for (const cc of classes) {
      if (!takenCombos.has(`${l.id}:${cc}`)) return true;
    }
    return false;
  });

  const availableClasses = leagueClasses.filter(
    (cc) => !takenCombos.has(`${leagueId}:${cc}`),
  );

  const hasEntries = (entries ?? []).length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" disabled={availableLeagues.length === 0}>
            {hasEntries ? "Tilmeld endnu et team lineup" : "Tilmeld team lineup"}
          </Button>
        )}
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
              {(members ?? []).map((m) => {
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
                      id={`dlg-pick-${teamId}-${m.user_id}`}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(m.user_id); else next.delete(m.user_id);
                        setSelected(next);
                      }}
                    />
                    <Label
                      htmlFor={`dlg-pick-${teamId}-${m.user_id}`}
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
  );
}
