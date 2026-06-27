import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import {
  ArrowLeft, Camera, Loader2, MessageSquare, Send, Shield, Star, Trash2, UserPlus,
  Users, Check, X, LogOut, Crown, Pencil, Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GuestLock } from "@/components/GuestGate";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LeagueTeamSignupCard, MyLineupInvitations } from "@/components/LeagueTeamSignupCard";
import { syncTeamDiscordResources } from "@/lib/team-discord.functions";


export const Route = createFileRoute("/teams/$teamId")({
  head: ({ params }) => ({
    meta: [
      { title: "Team – LMU Danmark" },
      { property: "og:title", content: "Team – LMU Danmark" },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `https://danishenduranceseries.dk/teams/${params.teamId}` }],
  }),
  component: TeamDetailPage,
});

type Team = {
  id: string;
  name: string;
  bio: string | null;
  logo_url: string | null;
  owner_id: string;
};

type Member = {
  id: string;
  user_id: string;
  role: "owner" | "member";
  car_class: string | null;
  created_at: string;
};

const TEAM_CAR_CLASSES = ["Hypercar", "LMP2", "LMGT3"] as const;

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

async function signed(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

function TeamDetailPage() {
  const { teamId } = useParams({ from: "/teams/$teamId" });
  const { user, isAdmin, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();


  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("teams")
        .select("id, name, bio, logo_url, owner_id")
        .eq("id", teamId)
        .maybeSingle();
      if (error) throw error;
      return data as Team | null;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["team-members", teamId, user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_members")
        .select("id, user_id, role, car_class, created_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = useQuery({
    queryKey: ["team-member-profiles", memberIds.sort().join(",")],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", memberIds);
      if (error) throw error;
      const map: Record<string, Profile> = {};
      for (const p of (data ?? []) as Profile[]) map[p.id] = p;
      return map;
    },
  });

  const { data: avatars } = useQuery({
    queryKey: ["team-member-avatars", memberIds.sort().join(",")],
    enabled: !!profiles,
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        Object.values(profiles!).map(async (p) => {
          if (p.avatar_url) {
            const u = await signed("avatars", p.avatar_url);
            if (u) map[p.id] = u;
          }
        }),
      );
      return map;
    },
  });

  const { data: logoUrl } = useQuery({
    queryKey: ["team-logo", team?.logo_url],
    enabled: !!team?.logo_url,
    queryFn: () => signed("team-logos", team!.logo_url!),
  });

  const { data: teamRatingRow } = useQuery({
    queryKey: ["team-rating", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_ratings")
        .select("score, percentile, confidence")
        .eq("team_id", teamId)
        .maybeSingle();
      if (error) throw error;
      return data as { score: number; percentile: number | null; confidence: number } | null;
    },
  });

  const teamRating = useMemo(() => {
    if (!teamRatingRow || Number(teamRatingRow.confidence) <= 0) return null;
    return Math.round(Number(teamRatingRow.score));
  }, [teamRatingRow]);

  const isMember = !!user && (members ?? []).some((m) => m.user_id === user.id);
  const isOwner = !!user && team?.owner_id === user.id;

  if (isLoading) return <p className="text-sm text-muted-foreground">Indlæser…</p>;
  if (!authLoading && !user) {
    return (
      <GuestLock
        title="Teams kræver login"
        message="Log ind for at se teamets medlemmer, bio og resultater."
      />
    );
  }
  if (!team) return <p className="text-sm text-muted-foreground">Team blev ikke fundet.</p>;

  const initials = team.name.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <Link to="/teams" className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Alle teams
      </Link>

      <header className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Banner with blurred logo backdrop */}
        <div className="relative h-28 overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-transparent sm:h-36">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
        </div>

        <div className="-mt-12 px-4 pb-4 sm:-mt-14 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Avatar className="h-20 w-20 ring-4 ring-card sm:h-24 sm:w-24">
              {logoUrl ? <AvatarImage src={logoUrl} alt={team.name} /> : null}
              <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-2 sm:pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                Team
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{team.name}</h1>
            </div>
          </div>
        </div>

        {/* Meta strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border bg-muted/30 px-4 py-2.5 text-xs sm:px-6">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Users className="h-3.5 w-3.5 text-primary" />
            {(members ?? []).length} medlem{(members ?? []).length === 1 ? "" : "mer"}
          </span>
          {teamRating != null && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground" title="Teamets rating (baseret på teamets resultater)">
              <Star className="h-3.5 w-3.5 text-primary" />
              Team-rating {teamRating}
            </span>
          )}
        </div>

        <div className="space-y-3 p-4 sm:p-6">
          {team.bio && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{team.bio}</p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {!user && (
              <Button size="sm" onClick={() => navigate({ to: "/login" })}>Log ind for at ansøge</Button>
            )}
            {user && !isMember && <ApplyButton teamId={teamId} userId={user.id} />}
            {user && isMember && !isOwner && <LeaveButton teamId={teamId} userId={user.id} onLeft={() => navigate({ to: "/teams" })} />}
            {isOwner && <EditTeamButton team={team} />}
            {(isOwner || isAdmin) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive"
                onClick={async () => {
                  if (!confirm("Slet team for evigt? Denne handling kan ikke fortrydes.")) return;
                  if (!confirm("Er du HELT sikker? Teamet og alle dets data slettes permanent.")) return;
                  const { error } = await (supabase as any).from("teams").delete().eq("id", team.id);
                  if (error) toastError(error.message);
                  else {
                    toast.success("Team slettet");
                    qc.invalidateQueries({ queryKey: ["teams"] });
                    qc.invalidateQueries({ queryKey: ["my-teams"] });
                    navigate({ to: "/teams" });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> Slet team{isAdmin && !isOwner ? " (admin)" : ""}
              </Button>
            )}
          </div>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Medlemmer</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {(members ?? []).map((m) => {
              const p = profiles?.[m.user_id];
              const av = avatars?.[m.user_id];
              const name = p?.display_name ?? "Uden navn";
              return (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <Avatar className="h-8 w-8">
                    {av ? <AvatarImage src={av} alt="" /> : null}
                    <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <Link to="/profil/$userId" params={{ userId: m.user_id }} className="min-w-0 flex-1 truncate text-sm hover:underline">
                    {name}
                  </Link>
                  <MemberClassBadge
                    teamId={teamId}
                    member={m}
                    canEdit={!!(isOwner || isAdmin)}
                  />
                  {m.role === "owner" && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Crown className="h-3 w-3" /> Ejer
                    </Badge>
                  )}
                  {isOwner && m.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        if (!confirm(`Fjern ${name} fra teamet?`)) return;
                        const { error } = await (supabase as any).from("team_members").delete().eq("id", m.id);
                        if (error) toastError(error.message);
                        else {
                          toast.success("Medlem fjernet");
                          qc.invalidateQueries({ queryKey: ["team-members", teamId] });
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <RecentResultsCard members={members ?? []} profiles={profiles ?? {}} />

      {isMember && <MyLineupInvitations teamId={teamId} />}
      {isOwner && (
        <LeagueTeamSignupCard
          teamId={teamId}
          members={(members ?? []).map((m) => ({
            user_id: m.user_id,
            display_name: profiles?.[m.user_id]?.display_name ?? null,
            car_class: m.car_class ?? null,
          }))}
        />
      )}

      {isOwner && <OwnerInbox teamId={teamId} />}
      {isOwner && <InviteCard teamId={teamId} userId={user!.id} existingMemberIds={memberIds} />}

    </div>
  );
}



// --- Recent results per member ---
function RecentResultsCard({
  members,
  profiles,
}: {
  members: Member[];
  profiles: Record<string, Profile>;
}) {
  const userIds = members.map((m) => m.user_id);
  const { data: results } = useQuery({
    queryKey: ["team-recent-results", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_results")
        .select("id, user_id, division_id, league_id, position, car_class, session_type, created_at, divisions(name, track, race_date), leagues(name)")
        .in("user_id", userIds)
        .eq("session_type", "race")
        .not("division_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const byUser = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of results ?? []) {
      (map[r.user_id] ??= []).push(r);
    }
    for (const uid of Object.keys(map)) {
      map[uid] = map[uid].slice(0, 3);
    }
    return map;
  }, [results]);

  if (userIds.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4" /> Seneste løb pr. medlem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.map((m) => {
          const name = profiles[m.user_id]?.display_name ?? "Uden navn";
          const list = byUser[m.user_id] ?? [];
          return (
            <div key={m.id} className="rounded border border-border p-3">
              <p className="text-sm font-medium">{name}</p>
              {list.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Ingen afsluttede løb endnu.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs">
                  {list.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span className="truncate">
                        <span className="text-foreground">{e.leagues?.name ?? "Liga"}</span>
                        {" · "}{e.divisions?.name ?? "Afdeling"}
                        {e.car_class ? ` · ${e.car_class}` : ""}
                        {e.position ? ` · P${e.position}` : ""}
                      </span>
                      {e.divisions?.race_date && (
                        <span className="shrink-0 tabular-nums">
                          {new Date(e.divisions.race_date).toLocaleDateString("da-DK")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}


// --- Apply ---
function ApplyButton({ teamId, userId }: { teamId: string; userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");

  const { data: existing } = useQuery({
    queryKey: ["my-team-application", teamId, userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_applications")
        .select("id,status")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; status: string } | null;
    },
  });

  const { data: invite } = useQuery({
    queryKey: ["my-team-invitation", teamId, userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_invitations")
        .select("id,status")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; status: string } | null;
    },
  });

  const acceptInvite = useMutation({
    mutationFn: async () => {
      if (!invite) return;
      const { error: updErr } = await (supabase as any).from("team_invitations").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", invite.id);
      if (updErr) throw updErr;
      const { error: insErr } = await (supabase as any).from("team_members").insert({ team_id: teamId, user_id: userId, role: "member" });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success("Du er nu medlem!");
      qc.invalidateQueries({ queryKey: ["team-members", teamId] });
      qc.invalidateQueries({ queryKey: ["my-team-invitation", teamId, userId] });
      qc.invalidateQueries({ queryKey: ["my-teams"] });
    },
    onError: (e: Error) => toastError(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("team_applications").insert({
        team_id: teamId, user_id: userId, message: msg.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ansøgning sendt");
      setOpen(false); setMsg("");
      qc.invalidateQueries({ queryKey: ["my-team-application", teamId, userId] });
    },
    onError: (e: Error) => toastError(e.message),
  });

  if (invite) {
    return (
      <div className="flex gap-2">
        <Button size="sm" className="gap-1" onClick={() => acceptInvite.mutate()} disabled={acceptInvite.isPending}>
          <Check className="h-4 w-4" /> Accepter invitation
        </Button>
      </div>
    );
  }
  if (existing) return <Badge variant="outline">Ansøgning afventer</Badge>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><UserPlus className="h-4 w-4" /> Ansøg om at komme med</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Ansøg om medlemskab</DialogTitle></DialogHeader>
        <div>
          <Label>Besked til team-ejer (valgfri)</Label>
          <Textarea maxLength={500} rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Fortæl lidt om dig selv…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send ansøgning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveButton({ teamId, userId, onLeft }: { teamId: string; userId: string; onLeft: () => void }) {
  const { data: lockedTeam } = useQuery({
    queryKey: ["user-locked-team", userId],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("user_locked_team", { _user_id: userId });
      return (data ?? null) as string | null;
    },
  });
  const locked = lockedTeam === teamId;
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      disabled={locked}
      title={locked ? "Du er bekræftet på et lineup i en aktiv liga — du kan ikke forlade teamet før ligaen er færdig" : undefined}
      onClick={async () => {
        if (!confirm("Forlad teamet?")) return;
        const { error } = await (supabase as any).from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
        if (error) toastError(error.message);
        else { toast.success("Du har forladt teamet"); onLeft(); }
      }}
    >
      <LogOut className="h-4 w-4" /> {locked ? "Låst til team" : "Forlad team"}
    </Button>
  );
}


// --- Edit team ---
function EditTeamButton({ team }: { team: Team }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bio, setBio] = useState(team.bio ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    const { error } = await (supabase as any).from("teams").update({ bio: bio.trim() || null }).eq("id", team.id);
    if (error) return toastError(error.message);
    toast.success("Gemt");
    qc.invalidateQueries({ queryKey: ["team", team.id] });
    qc.invalidateQueries({ queryKey: ["teams"] });
    setOpen(false);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toastError("Maks 5 MB.");
    if (!file.type.startsWith("image/")) return toastError("Vælg en billedfil.");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${team.id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("team-logos").upload(path, file, {
      cacheControl: "3600", upsert: true, contentType: file.type,
    });
    if (upErr) { setUploading(false); return toastError(upErr.message); }
    const { error: dbErr } = await (supabase as any).from("teams").update({ logo_url: path }).eq("id", team.id);
    setUploading(false);
    if (dbErr) return toastError(dbErr.message);
    toast.success("Logo opdateret");
    qc.invalidateQueries({ queryKey: ["team", team.id] });
    qc.invalidateQueries({ queryKey: ["teams"] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1"><Pencil className="h-4 w-4" /> Rediger team</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Rediger {team.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                Upload logo
              </Button>
              <p className="text-xs text-muted-foreground">PNG/JPG, maks 5 MB.</p>
            </div>
          </div>
          <div>
            <Label>Bio</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
          <Button onClick={save}>Gem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Owner: applications inbox ---
function OwnerInbox({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const { data: apps } = useQuery({
    queryKey: ["team-applications", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_applications")
        .select("id, user_id, message, created_at, status")
        .eq("team_id", teamId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; user_id: string; message: string | null; created_at: string; status: string }[];
    },
  });

  const userIds = (apps ?? []).map((a) => a.user_id);
  const { data: profileMap } = useQuery({
    queryKey: ["team-applicant-profiles", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
      const map: Record<string, string> = {};
      for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
        map[p.id] = p.display_name ?? "Uden navn";
      }
      return map;
    },
  });

  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptClass, setAcceptClass] = useState<string>("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = (apps ?? []).find((a) => a.id === viewingId) ?? null;

  const accept = async (a: { id: string; user_id: string }) => {
    if (!acceptClass) return toastError("Vælg en klasse for køreren først");
    // Persist class on application so the trigger copies it to team_members on insert
    const { error: aErr } = await (supabase as any)
      .from("team_applications")
      .update({ car_class: acceptClass })
      .eq("id", a.id);
    if (aErr) return toastError(aErr.message);
    const { error: insErr } = await (supabase as any)
      .from("team_members")
      .insert({ team_id: teamId, user_id: a.user_id, role: "member", car_class: acceptClass });
    if (insErr) return toastError(insErr.message);
    await (supabase as any).from("team_applications").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", a.id);
    toast.success(`Optaget i teamet (${acceptClass})`);
    setAcceptingId(null);
    setAcceptClass("");
    qc.invalidateQueries({ queryKey: ["team-applications", teamId] });
    qc.invalidateQueries({ queryKey: ["team-members", teamId] });
  };
  const reject = async (a: { id: string }) => {
    const { error } = await (supabase as any).from("team_applications").update({ status: "rejected", responded_at: new Date().toISOString() }).eq("id", a.id);
    if (error) return toastError(error.message);
    qc.invalidateQueries({ queryKey: ["team-applications", teamId] });
  };

  if (!apps || apps.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ansøgninger ({apps.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {apps.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
              <button
                type="button"
                onClick={() => setViewingId(a.id)}
                className="min-w-0 flex-1 text-left hover:opacity-80"
              >
                <p className="truncate text-sm font-medium">{profileMap?.[a.user_id] ?? "Bruger"}</p>
                {a.message && <p className="line-clamp-2 text-xs text-muted-foreground">{a.message}</p>}
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">Klik for at se ansøgningen</p>
              </button>
              {acceptingId === a.id ? (
                <>
                  <Select value={acceptClass} onValueChange={setAcceptClass}>
                    <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Klasse…" /></SelectTrigger>
                    <SelectContent>
                      {TEAM_CAR_CLASSES.map((cc) => (
                        <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="gap-1" disabled={!acceptClass} onClick={() => accept(a)}>
                    <Check className="h-4 w-4" /> Bekræft
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAcceptingId(null); setAcceptClass(""); }}>
                    Annullér
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { setAcceptingId(a.id); setAcceptClass(""); }}>
                    <Check className="h-4 w-4" /> Godkend
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={() => reject(a)}>
                    <X className="h-4 w-4" /> Afvis
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
      <Dialog open={!!viewingId} onOpenChange={(o) => !o && setViewingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ansøgning fra {viewing ? (profileMap?.[viewing.user_id] ?? "Bruger") : ""}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Sendt {new Date(viewing.created_at).toLocaleString("da-DK")}
              </p>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {viewing.message?.trim() || <span className="text-muted-foreground italic">Ingen besked</span>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewingId(null)}>Luk</Button>
            {viewing && (
              <Button
                variant="outline"
                onClick={async () => { await reject(viewing); setViewingId(null); }}
              >
                <X className="h-4 w-4" /> Afvis
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// --- Invite ---
function InviteCard({ teamId, userId, existingMemberIds }: { teamId: string; userId: string; existingMemberIds: string[] }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>("");
  const [carClass, setCarClass] = useState<string>("");

  const { data: candidates } = useQuery({
    queryKey: ["invite-candidates", teamId, existingMemberIds.sort().join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .order("display_name", { ascending: true });
      if (error) throw error;
      const excluded = new Set(existingMemberIds);
      return (data ?? []).filter((p: any) => !excluded.has(p.id)) as { id: string; display_name: string | null }[];
    },
  });

  const send = async () => {
    if (!selected) return;
    if (!carClass) return toastError("Vælg en klasse for køreren først");
    const { data: existing } = await (supabase as any)
      .from("team_invitations")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", selected)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return toastError("Denne bruger har allerede en afventende invitation til teamet.");
    }
    const { error } = await (supabase as any).from("team_invitations").insert({
      team_id: teamId, user_id: selected, invited_by: userId, car_class: carClass,
    });
    if (error) {
      if ((error as any).code === "23505") {
        return toastError("Denne bruger har allerede en afventende invitation til teamet.");
      }
      return toastError(error.message);
    }
    try {
      const { notifyTeamInvitation } = await import("@/lib/messages.functions");
      await notifyTeamInvitation({ data: { teamId, userId: selected } });
    } catch (e) {
      console.error("notifyTeamInvitation failed", e);
    }
    toast.success(`Invitation sendt (${carClass})`);
    setSelected("");
    setCarClass("");
    qc.invalidateQueries({ queryKey: ["team-invitations-out", teamId] });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" /> Inviter bruger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[180px]">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder="Vælg bruger…" /></SelectTrigger>
              <SelectContent>
                {(candidates ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.display_name ?? "Uden navn"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[140px]">
            <Select value={carClass} onValueChange={setCarClass}>
              <SelectTrigger><SelectValue placeholder="Klasse…" /></SelectTrigger>
              <SelectContent>
                {TEAM_CAR_CLASSES.map((cc) => (
                  <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={send} disabled={!selected || !carClass}>Send invitation</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Vælg hvilken klasse køreren skal repræsentere teamet i. Klassen kan ændres bagefter på medlemslisten.
        </p>
      </CardContent>
    </Card>
  );
}

// --- Member class badge / inline editor ---
function MemberClassBadge({
  teamId,
  member,
  canEdit,
}: {
  teamId: string;
  member: Member;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(member.car_class ?? "");
  const [saving, setSaving] = useState(false);

  const save = async (next: string) => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("team_members")
      .update({ car_class: next || null })
      .eq("id", member.id);
    setSaving(false);
    if (error) return toastError(error.message);
    toast.success("Klasse opdateret");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["team-members", teamId] });
  };

  if (editing && canEdit) {
    return (
      <div className="flex items-center gap-1">
        <Select value={value} onValueChange={(v) => { setValue(v); save(v); }} disabled={saving}>
          <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Klasse…" /></SelectTrigger>
          <SelectContent>
            {TEAM_CAR_CLASSES.map((cc) => (
              <SelectItem key={cc} value={cc}>{cc}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  if (!member.car_class) {
    return canEdit ? (
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 px-2 text-[10px]"
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3 w-3" /> Vælg klasse
      </Button>
    ) : (
      <Badge variant="outline" className="text-[10px]">Ingen klasse</Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[10px] ${canEdit ? "cursor-pointer hover:bg-accent" : ""}`}
      onClick={canEdit ? () => setEditing(true) : undefined}
    >
      {member.car_class}
      {canEdit && <Pencil className="h-3 w-3 opacity-60" />}
    </Badge>
  );
}

