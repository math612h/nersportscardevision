import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  withdrawTeamFromLeague,
  respondLeagueLineup,
  removeDriversFromLineup,
} from "@/lib/league-team-entries.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamLeagueSignupDialog } from "./TeamLeagueSignupDialog";

type Member = { user_id: string; display_name: string | null; car_class: string | null };

export function LeagueTeamSignupCard({
  teamId,
  members,
}: {
  teamId: string;
  members: Member[];
}) {
  const qc = useQueryClient();
  const withdrawFn = useServerFn(withdrawTeamFromLeague);
  const removeFn = useServerFn(removeDriversFromLineup);

  const { data: entries } = useQuery({
    queryKey: ["team-league-entries", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("league_team_entries")
        .select(
          "id, league_id, car_class, status, leagues:league_id(name), league_team_lineup(id, user_id, status, effective_from, effective_until)",
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
        league_team_lineup: Array<{ id: string; user_id: string; status: string; effective_from: string | null; effective_until: string | null }>;
      }>;
    },
  });

  const removeDriver = useMutation({
    mutationFn: async (v: { entryId: string; userId: string }) =>
      await removeFn({ data: { entryId: v.entryId, userIds: [v.userId] } }),
    onSuccess: async (_result, removed) => {
      // Update the visible lineup only after the server confirms the removal,
      // then fetch the authoritative rows so a refresh cannot revive the driver.
      qc.setQueryData<typeof entries>(["team-league-entries", teamId], (current) =>
        current?.map((entry) =>
          entry.id !== removed.entryId
            ? entry
            : {
                ...entry,
                league_team_lineup: entry.league_team_lineup.map((driver) =>
                  driver.user_id === removed.userId
                    ? { ...driver, effective_until: new Date().toISOString() }
                    : driver,
                ),
              },
        ),
      );
      await Promise.all([
        qc.refetchQueries({ queryKey: ["team-league-entries", teamId], exact: true }),
        qc.invalidateQueries({ queryKey: ["league-team-entries-mine"] }),
      ]);
      toast.success("Køreren er fjernet fra lineupet — tidligere afdelingers team-point er uændrede");
    },
    onError: (e) => toastError((e as Error).message),
  });

  const leagueIds = useMemo(
    () => Array.from(new Set((entries ?? []).map((e) => e.league_id))),
    [entries],
  );

  const { data: lastRaceByLeague } = useQuery({
    queryKey: ["team-league-last-race", leagueIds.join(",")],
    enabled: leagueIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("divisions")
        .select("league_id, race_date")
        .in("league_id", leagueIds);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const d of (data ?? []) as Array<{ league_id: string; race_date: string | null }>) {
        if (!d.race_date) continue;
        const prev = m.get(d.league_id);
        if (!prev || d.race_date > prev) m.set(d.league_id, d.race_date);
      }
      return m;
    },
  });

  const memberById = useMemo(() => {
    const m = new Map<string, Member>();
    for (const x of members) m.set(x.user_id, x);
    return m;
  }, [members]);

  const { active, finished } = useMemo(() => {
    const all = entries ?? [];
    if (!lastRaceByLeague) return { active: all, finished: [] as typeof all };
    const now = Date.now();
    const fin = all.filter((e) => {
      const last = lastRaceByLeague.get(e.league_id);
      return !!last && new Date(last).getTime() < now;
    });
    const finIds = new Set(fin.map((e) => e.id));
    return { active: all.filter((e) => !finIds.has(e.id)), finished: fin };
  }, [entries, lastRaceByLeague]);

  const renderEntry = (e: NonNullable<typeof entries>[number], readOnly: boolean) => {
    const activeLineup = e.league_team_lineup.filter((l) => !l.effective_until);
    const removedLineup = e.league_team_lineup.filter((l) => !!l.effective_until);
    const accepted = activeLineup.filter((l) => l.status === "accepted").length;
    const invited = activeLineup.filter((l) => l.status === "invited").length;
    const declined = activeLineup.filter((l) => l.status === "declined").length;
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
          {!readOnly && (
            <>
              <TeamLeagueSignupDialog
                teamId={teamId}
                existingEntry={{
                  entryId: e.id,
                  leagueId: e.league_id,
                  carClass: e.car_class,
                  lockedUserIds: activeLineup
                    .filter((l) => l.status !== "declined")
                    .map((l) => l.user_id),
                }}
              />
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
            </>
          )}
        </div>
        <ul className="basis-full space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          {activeLineup.map((l) => {
            const name = memberById.get(l.user_id)?.display_name ?? "Ukendt";
            const icon = l.status === "accepted" ? "✅" : l.status === "declined" ? "❌" : "⏳";
            return (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <span>
                  {icon} {name} <span className="opacity-60">— {l.status}</span>
                  {l.effective_from && (
                    <span className="opacity-60">
                      {" "}· tæller fra {new Date(l.effective_from).toLocaleDateString("da-DK")}
                    </span>
                  )}
                </span>
                {!readOnly && l.status !== "declined" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    title={`Fjern ${name} fra lineupet`}
                    disabled={removeDriver.isPending}
                    onClick={() => {
                      if (
                        !confirm(
                          `Fjern ${name} fra lineupet i ${e.leagues?.name ?? "ligaen"} (${e.car_class})? Kørerens bidrag i allerede kørte afdelinger bevares.`,
                        )
                      )
                        return;
                      removeDriver.mutate({ entryId: e.id, userId: l.user_id });
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
          {activeLineup.length === 0 && (
            <li className="opacity-70">Ingen aktive kørere på lineupet.</li>
          )}
          {removedLineup.length > 0 && (
            <li>
              <details className="mt-1 rounded-md bg-muted/40 px-2 py-1">
                <summary className="cursor-pointer text-[11px] opacity-70">
                  Tidligere lineup ({removedLineup.length} fjernet)
                </summary>
                <ul className="mt-1 space-y-1">
                  {removedLineup.map((l) => {
                    const name = memberById.get(l.user_id)?.display_name ?? "Ukendt";
                    return (
                      <li key={l.id} className="line-through opacity-70">
                        🚫 {name}
                        {l.effective_until && (
                          <span className="opacity-70">
                            {" "}· fjernet {new Date(l.effective_until).toLocaleDateString("da-DK")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          )}
        </ul>
      </li>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4" /> Team-tilmeldinger
        </CardTitle>
        <TeamLeagueSignupDialog teamId={teamId} />
      </CardHeader>
      <CardContent className="space-y-2">
        {(entries ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Teamet er ikke tilmeldt nogen liga endnu.</p>
        ) : (
          <>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen aktive liga-tilmeldinger lige nu.</p>
            ) : (
              <ul className="space-y-2">{active.map((e) => renderEntry(e, false))}</ul>
            )}
            {finished.length > 0 && (
              <details className="rounded-md border border-border/60 bg-muted/30 p-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Tidligere ligaer ({finished.length})
                </summary>
                <ul className="mt-2 space-y-2 opacity-80">
                  {finished.map((e) => renderEntry(e, true))}
                </ul>
              </details>
            )}
          </>
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
