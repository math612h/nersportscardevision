import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, CheckCircle2, Shield } from "lucide-react";
import { CreateTeamDialog } from "@/components/CreateTeamDialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RatingBadge } from "@/components/RatingBadge";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({ meta: [{ title: "Min profil – DanishEnduranceSeries.dk" }] }),
  component: ProfilePage,
});

async function signedAvatarUrl(path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data, error }, { data: priv }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, lmu_name, bio, achievements, avatar_url, approved")
          .eq("id", user!.id)
          .maybeSingle(),
        supabase.rpc("get_profile_private", { _user_id: user!.id }).maybeSingle(),
      ]);
      if (error) throw error;
      if (!data) return null;
      return { ...data, age: priv?.age ?? null, discord_username: priv?.discord_username ?? null };
    },
  });

  const { data: avatarUrl } = useQuery({
    queryKey: ["avatar-url", profile?.avatar_url],
    enabled: !!profile?.avatar_url,
    queryFn: () => signedAvatarUrl(profile!.avatar_url),
  });

  const [displayName, setDisplayName] = useState("");
  const [lmuName, setLmuName] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [achievements, setAchievements] = useState("");
  const [discord, setDiscord] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setLmuName(profile.lmu_name ?? "");
    setAge(profile.age != null ? String(profile.age) : "");
    setBio(profile.bio ?? "");
    setAchievements(profile.achievements ?? "");
    setDiscord(profile.discord_username ?? "");
  }, [profile]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = displayName.trim();
    const lmu = lmuName.trim();
    if (!name) return toast.error("Visningsnavn er påkrævet.");
    if (!lmu) return toast.error("LMU-navn er påkrævet.");
    const ageNum = age.trim() === "" ? null : Number(age);
    if (ageNum !== null && (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 120)) {
      return toast.error("Indtast en gyldig alder.");
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name,
        lmu_name: lmu,
        bio: bio.trim() || null,
        achievements: achievements.trim() || null,
      })
      .eq("id", user.id);
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    const { error: privErr } = await (supabase as any)
      .from("profiles_private")
      .upsert({
        user_id: user.id,
        age: ageNum,
        discord_username: discord.trim() || null,
      }, { onConflict: "user_id" });
    setSaving(false);
    if (privErr) return toast.error(privErr.message);
    toast.success("Profil opdateret.");
    qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
    if (window.history.length > 1) router.history.back();
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Billedet må højst være 5 MB.");
    if (!file.type.startsWith("image/")) return toast.error("Vælg en billedfil.");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
    setUploading(false);
    if (dbErr) return toast.error(dbErr.message);
    toast.success("Profilbillede opdateret.");
    qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
  };

  if (isLoading) {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-muted-foreground">Indlæser…</div>;
  }

  const initials = (displayName || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Min profil</CardTitle>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/arkiv">Mit arkiv</Link>
              </Button>
              {profile?.approved ? (
                <Badge variant="secondary" className="gap-1 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" /> Godkendt kører
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Afventer godkendelse</Badge>
              )}
            </div>
          </div>
          <CardDescription>Opdater dine oplysninger – LMU-navnet bruges til at koble løbsresultater til dig.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="Profilbillede" /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                Skift billede
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">JPG/PNG, maks 5 MB.</p>
            </div>
          </div>

          <form onSubmit={onSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Visningsnavn</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} required />
              </div>
              <div>
                <Label>LMU-navn</Label>
                <Input value={lmuName} onChange={(e) => setLmuName(e.target.value)} maxLength={80} required />
              </div>
              <div>
                <Label>Alder</Label>
                <Input type="number" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              <div>
                <Label>Discord-brugernavn</Label>
                <Input value={discord} onChange={(e) => setDiscord(e.target.value)} maxLength={80} placeholder="dit_discord_navn" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled />
              </div>
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} placeholder="Lidt om dig selv…" />
            </div>
            <div>
              <Label>Achievements</Label>
              <Textarea value={achievements} onChange={(e) => setAchievements(e.target.value)} maxLength={1000} placeholder="Mesterskaber, pole positions, podier…" />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Gem ændringer
            </Button>
          </form>
        </CardContent>
      </Card>

      <MyRatingsCard userId={user?.id ?? null} />
      <MyTeamsCard userId={user?.id ?? null} />
      <DeviceTokensCard />
    </div>
  );
}

function MyRatingsCard({ userId }: { userId: string | null }) {
  const { data: ratings } = useQuery({
    queryKey: ["my-class-ratings", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_class_ratings")
        .select("car_class,score,percentile,confidence")
        .eq("user_id", userId!)
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Min rating</CardTitle>
        <CardDescription>
          Én rating pr. bilklasse, beregnet på tværs af alle ligaer. Top 5% = blå · top 25% = guld · top 50% = sølv · resten = bronze. <span className="opacity-60">~</span> = estimat indtil der er nok data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {!ratings || ratings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen rating endnu. Du får en så snart du har data i en bilklasse.</p>
        ) : (
          ratings.map((r) => (
            <div key={r.car_class} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1 truncate">
                <span className="font-medium">{r.car_class}</span>
              </div>
              <RatingBadge
                score={Number(r.score)}
                percentile={r.percentile != null ? Number(r.percentile) : null}
                confidence={Number(r.confidence)}
                carClass={r.car_class}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Mine teams ----------
function MyTeamsCard({ userId }: { userId: string | null }) {
  const { data: rows } = useQuery({
    queryKey: ["my-teams", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_members")
        .select("role, teams(id, name)")
        .eq("user_id", userId);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...r.teams, role: r.role })).filter(Boolean) as { id: string; name: string; role: string }[];
    },
  });
  const { data: invites } = useQuery({
    queryKey: ["my-team-invitations", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_invitations")
        .select("id, team_id, teams(name)")
        .eq("user_id", userId)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []) as { id: string; team_id: string; teams: { name: string } | null }[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Mine teams</CardTitle>
            <CardDescription>Du kan maks være med i 3 teams.</CardDescription>
          </div>
          <CreateTeamDialog />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Du er ikke med på noget team endnu.</p>
        ) : (
          <ul className="space-y-1.5">
            {(rows ?? []).map((t) => (
              <li key={t.id}>
                <Link to="/teams/$teamId" params={{ teamId: t.id }} className="flex items-center gap-2 rounded border border-border px-3 py-2 text-sm hover:bg-accent">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{t.name}</span>
                  {t.role === "owner" && <Badge variant="secondary" className="text-[10px]">Ejer</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {(invites ?? []).length > 0 && (
          <div className="rounded border border-dashed border-border p-2">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Invitationer</p>
            <ul className="space-y-1.5">
              {(invites ?? []).map((inv) => (
                <li key={inv.id}>
                  <Link to="/teams/$teamId" params={{ teamId: inv.team_id }} className="flex items-center gap-2 text-sm hover:underline">
                    <span className="flex-1 truncate">{inv.teams?.name ?? "Team"}</span>
                    <Badge variant="outline" className="text-[10px]">Åbn for at acceptere</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Device tokens for the desktop companion app ----------
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Plus, Trash2, Monitor } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createDeviceToken, deleteDeviceToken } from "@/lib/device-tokens.functions";

type DeviceTokenRow = {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};

function DeviceTokensCard() {
  const qc = useQueryClient();
  const createFn = useServerFn(createDeviceToken);
  const deleteFn = useServerFn(deleteDeviceToken);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["device-tokens"],
    queryFn: async (): Promise<DeviceTokenRow[]> => {
      const { data, error } = await supabase
        .from("device_tokens")
        .select("id, name, created_at, last_used_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeviceTokenRow[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => createFn({ data: { name: name.trim() || "Desktop" } }),
    onSuccess: (res) => {
      setGenerated(res.token);
      setName("");
      qc.invalidateQueries({ queryKey: ["device-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Token slettet");
      qc.invalidateQueries({ queryKey: ["device-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success("Kopieret"); }
    catch { toast.error("Kunne ikke kopiere"); }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" />Desktop companion</CardTitle>
            <CardDescription>
              Generér en adgangsnøgle som du paster ind i DES Companion-appen på din PC. Den overvåger din LMU
              Results-mappe og uploader automatisk nye race-filer til leaderboardet.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setGenerated(null); setOpen(true); }} className="gap-1">
            <Plus className="h-4 w-4" /> Ny nøgle
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Indlæser…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Du har ingen adgangsnøgler endnu.</p>
        ) : (
          <ul className="space-y-2">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />{t.name || "Uden navn"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Oprettet {new Date(t.created_at).toLocaleDateString("da-DK")} ·{" "}
                    {t.last_used_at ? `senest brugt ${new Date(t.last_used_at).toLocaleString("da-DK")}` : "aldrig brugt"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => { if (confirm("Slet denne adgangsnøgle? Companion-appen skal pares igen.")) deleteMut.mutate(t.id); }}
                  aria-label="Slet nøgle"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setGenerated(null); }}>
        <DialogContent>
          {!generated ? (
            <>
              <DialogHeader>
                <DialogTitle>Ny adgangsnøgle</DialogTitle>
                <DialogDescription>
                  Giv nøglen et navn så du kan kende den igen (f.eks. navnet på din PC).
                </DialogDescription>
              </DialogHeader>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Min gaming-PC"
                maxLength={80}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                  {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Generér
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Din nye adgangsnøgle</DialogTitle>
                <DialogDescription>
                  Kopiér nøglen nu — den vises kun denne ene gang. Paste den ind i companion-appen.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <code className="flex-1 truncate text-xs font-mono">{generated}</code>
                <Button size="icon" variant="ghost" onClick={() => copy(generated)} aria-label="Kopiér">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Færdig</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

