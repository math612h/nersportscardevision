import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Camera, Loader2, MessageSquare, Send, Shield, Trash2, UserPlus,
  Users, Check, X, LogOut, Crown, Pencil, Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

export const Route = createFileRoute("/teams/$teamId")({
  head: ({ params }) => ({
    meta: [
      { title: "Team – DanishEnduranceSeries.dk" },
      { property: "og:title", content: "Team – DanishEnduranceSeries.dk" },
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
  created_at: string;
};

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

async function signed(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

function TeamDetailPage() {
  const { teamId } = useParams({ from: "/teams/$teamId" });
  const { user } = useAuth();
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
    queryKey: ["team-members", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_members")
        .select("id, user_id, role, created_at")
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

  const isMember = !!user && (members ?? []).some((m) => m.user_id === user.id);
  const isOwner = !!user && team?.owner_id === user.id;

  if (isLoading) return <p className="text-sm text-muted-foreground">Indlæser…</p>;
  if (!team) return <p className="text-sm text-muted-foreground">Team blev ikke fundet.</p>;

  const initials = team.name.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <Link to="/teams" className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Alle teams
      </Link>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-20 w-20">
            {logoUrl ? <AvatarImage src={logoUrl} alt={team.name} /> : null}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" /> {(members ?? []).length} medlem{(members ?? []).length === 1 ? "" : "mer"}
              </Badge>
            </div>
            {team.bio && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{team.bio}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              {!user && (
                <Button size="sm" onClick={() => navigate({ to: "/login" })}>Log ind for at ansøge</Button>
              )}
              {user && !isMember && <ApplyButton teamId={teamId} userId={user.id} />}
              {user && isMember && !isOwner && <LeaveButton teamId={teamId} userId={user.id} onLeft={() => navigate({ to: "/teams" })} />}
              {isOwner && <EditTeamButton team={team} />}
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-destructive"
                  onClick={async () => {
                    if (!confirm("Slet team for evigt?")) return;
                    const { error } = await (supabase as any).from("teams").delete().eq("id", team.id);
                    if (error) toast.error(error.message);
                    else {
                      toast.success("Team slettet");
                      qc.invalidateQueries({ queryKey: ["teams"] });
                      qc.invalidateQueries({ queryKey: ["my-teams"] });
                      navigate({ to: "/teams" });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Slet team
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

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
                  <Link to="/profil/$userId" params={{ userId: m.user_id }} className="flex-1 truncate text-sm hover:underline">
                    {name}
                  </Link>
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
                        if (error) toast.error(error.message);
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

      {isOwner && <OwnerInbox teamId={teamId} />}
      {isOwner && <InviteCard teamId={teamId} userId={user!.id} existingMemberIds={memberIds} />}

      {isMember && (
        <ComposeMessageCard
          teamId={teamId}
          userId={user!.id}
          members={members ?? []}
          profiles={profiles ?? {}}
        />
      )}

      {isMember && <TeamChat teamId={teamId} userId={user!.id} profiles={profiles ?? {}} avatars={avatars ?? {}} />}
      {!isMember && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            <MessageSquare className="mx-auto mb-2 h-5 w-5" />
            Kun teamets medlemmer kan se chatten.
          </CardContent>
        </Card>
      )}
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
  const { data: entries } = useQuery({
    queryKey: ["team-recent-entries", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("id, user_id, division_id, league_id, created_at, divisions(name, track, race_date), leagues(name)")
        .in("user_id", userIds)
        .not("division_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const byUser = useMemo(() => {
    const map: Record<string, any[]> = {};
    const now = Date.now();
    for (const e of entries ?? []) {
      const raceDate = e.divisions?.race_date ? new Date(e.divisions.race_date).getTime() : null;
      // Only finished races
      if (!raceDate || raceDate > now) continue;
      (map[e.user_id] ??= []).push(e);
    }
    for (const uid of Object.keys(map)) {
      map[uid] = map[uid].slice(0, 3);
    }
    return map;
  }, [entries]);

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
                        {e.divisions?.track ? ` · ${e.divisions.track}` : ""}
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

// --- Compose targeted message ---
function ComposeMessageCard({
  teamId, userId, members, profiles,
}: {
  teamId: string;
  userId: string;
  members: Member[];
  profiles: Record<string, Profile>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const others = members.filter((m) => m.user_id !== userId);
  const allChosen = others.length > 0 && others.every((m) => selected[m.user_id]);
  const chosenIds = others.filter((m) => selected[m.user_id]).map((m) => m.user_id);

  const toggleAll = () => {
    if (allChosen) setSelected({});
    else {
      const next: Record<string, boolean> = {};
      for (const m of others) next[m.user_id] = true;
      setSelected(next);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || chosenIds.length === 0) return;
    setSending(true);
    const names = chosenIds.map((id) => `@${profiles[id]?.display_name ?? "medlem"}`).join(" ");
    const prefix = allChosen ? "@alle" : names;
    const content = `${prefix}: ${body}`.slice(0, 2000);
    const { error } = await (supabase as any)
      .from("team_messages")
      .insert({ team_id: teamId, user_id: userId, content });
    setSending(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Besked sendt i chatten");
      setOpen(false);
      setText("");
      setSelected({});
    }
  };

  if (others.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Send className="h-4 w-4" /> Skriv målrettet besked
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Skriv til ét, flere eller alle medlemmer. Beskeden lægges i team-chatten med @nævn så hele teamet kan se den.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Send className="h-4 w-4" /> Ny besked</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ny besked</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Modtagere</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
                    {allChosen ? "Fravælg alle" : "Vælg alle"}
                  </Button>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-border p-2">
                  {others.map((m) => {
                    const name = profiles[m.user_id]?.display_name ?? "Uden navn";
                    return (
                      <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={!!selected[m.user_id]}
                          onChange={(e) => setSelected((s) => ({ ...s, [m.user_id]: e.target.checked }))}
                        />
                        <span className="flex-1 truncate">{name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Besked</Label>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  maxLength={1800}
                  placeholder="Skriv din besked…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
              <Button onClick={send} disabled={sending || !text.trim() || chosenIds.length === 0}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
      const { error: insErr } = await (supabase as any).from("team_members").insert({ team_id: teamId, user_id: userId, role: "member" });
      if (insErr) throw insErr;
      await (supabase as any).from("team_invitations").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", invite.id);
    },
    onSuccess: () => {
      toast.success("Du er nu medlem!");
      qc.invalidateQueries({ queryKey: ["team-members", teamId] });
      qc.invalidateQueries({ queryKey: ["my-team-invitation", teamId, userId] });
      qc.invalidateQueries({ queryKey: ["my-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
    onError: (e: Error) => toast.error(e.message),
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
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      onClick={async () => {
        if (!confirm("Forlad teamet?")) return;
        const { error } = await (supabase as any).from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
        if (error) toast.error(error.message);
        else { toast.success("Du har forladt teamet"); onLeft(); }
      }}
    >
      <LogOut className="h-4 w-4" /> Forlad team
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
    if (error) return toast.error(error.message);
    toast.success("Gemt");
    qc.invalidateQueries({ queryKey: ["team", team.id] });
    qc.invalidateQueries({ queryKey: ["teams"] });
    setOpen(false);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Maks 5 MB.");
    if (!file.type.startsWith("image/")) return toast.error("Vælg en billedfil.");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${team.id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("team-logos").upload(path, file, {
      cacheControl: "3600", upsert: true, contentType: file.type,
    });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { error: dbErr } = await (supabase as any).from("teams").update({ logo_url: path }).eq("id", team.id);
    setUploading(false);
    if (dbErr) return toast.error(dbErr.message);
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

  const accept = async (a: { id: string; user_id: string }) => {
    const { error: insErr } = await (supabase as any).from("team_members").insert({ team_id: teamId, user_id: a.user_id, role: "member" });
    if (insErr) return toast.error(insErr.message);
    await (supabase as any).from("team_applications").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", a.id);
    toast.success("Optaget i teamet");
    qc.invalidateQueries({ queryKey: ["team-applications", teamId] });
    qc.invalidateQueries({ queryKey: ["team-members", teamId] });
  };
  const reject = async (a: { id: string }) => {
    const { error } = await (supabase as any).from("team_applications").update({ status: "rejected", responded_at: new Date().toISOString() }).eq("id", a.id);
    if (error) return toast.error(error.message);
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
            <li key={a.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{profileMap?.[a.user_id] ?? "Bruger"}</p>
                {a.message && <p className="line-clamp-2 text-xs text-muted-foreground">{a.message}</p>}
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => accept(a)}>
                <Check className="h-4 w-4" /> Godkend
              </Button>
              <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={() => reject(a)}>
                <X className="h-4 w-4" /> Afvis
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// --- Invite ---
function InviteCard({ teamId, userId, existingMemberIds }: { teamId: string; userId: string; existingMemberIds: string[] }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>("");

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
    const { error } = await (supabase as any).from("team_invitations").insert({
      team_id: teamId, user_id: selected, invited_by: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Invitation sendt");
    setSelected("");
    qc.invalidateQueries({ queryKey: ["team-invitations-out", teamId] });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" /> Inviter bruger</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px]">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue placeholder="Vælg bruger…" /></SelectTrigger>
            <SelectContent>
              {(candidates ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.display_name ?? "Uden navn"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={send} disabled={!selected}>Send invitation</Button>
      </CardContent>
    </Card>
  );
}

// --- Chat ---
function TeamChat({
  teamId, userId, profiles, avatars,
}: { teamId: string; userId: string; profiles: Record<string, Profile>; avatars: Record<string, string> }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useQuery({
    queryKey: ["team-messages", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_messages")
        .select("id, user_id, content, created_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; user_id: string; content: string; created_at: string }[];
    },
  });

  // Realtime subscribe
  useEffect(() => {
    const channel = supabase
      .channel(`team-messages-${teamId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages", filter: `team_id=eq.${teamId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["team-messages", teamId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamId, qc]);

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    const { error } = await (supabase as any).from("team_messages").insert({
      team_id: teamId, user_id: userId, content: content.slice(0, 2000),
    });
    if (error) toast.error(error.message);
    else setText("");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Team chat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={listRef} className="max-h-96 space-y-2 overflow-y-auto rounded border border-border bg-muted/20 p-3">
          {(messages ?? []).length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">Ingen beskeder endnu. Vær den første!</p>
          ) : (
            (messages ?? []).map((m) => {
              const p = profiles[m.user_id];
              const av = avatars[m.user_id];
              const mine = m.user_id === userId;
              const name = p?.display_name ?? "Ukendt";
              return (
                <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                  <Avatar className="h-7 w-7 shrink-0">
                    {av ? <AvatarImage src={av} alt="" /> : null}
                    <AvatarFallback className="text-[10px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-background border border-border"}`}>
                    <p className={`text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {name} · {new Date(m.created_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <form onSubmit={send} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv en besked…" maxLength={2000} />
          <Button type="submit" disabled={!text.trim()} className="gap-1">
            <Send className="h-4 w-4" /> Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
