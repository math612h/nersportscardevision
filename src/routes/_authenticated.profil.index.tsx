import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Shield, Link2, Unlink } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { RatingBadge } from "@/components/RatingBadge";
import { startDiscordLink, unlinkDiscord } from "@/lib/discord.functions";
import { notifyAdminNameUpdated } from "@/lib/admin-name-notify.functions";

export const Route = createFileRoute("/_authenticated/profil/")({
  head: () => ({ meta: [{ title: "Min profil – LMU Danmark" }] }),
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
  

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data, error }, { data: priv }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, lmu_name, bio, achievements, avatar_url, discord_avatar_url, approved, accepts_danish, media_consent")
          .eq("id", user!.id)
          .maybeSingle(),
        (supabase as unknown as { from: (t: string) => any })
          .from("profiles_private")
          .select("age, discord_username, address, postal_code, city, country")
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);
      if (error) throw error;
      if (!data) return null;
      const p = (priv ?? {}) as any;
      return {
        ...data,
        age: p?.age ?? null,
        discord_username: p?.discord_username ?? null,
        address: p?.address ?? "",
        postal_code: p?.postal_code ?? "",
        city: p?.city ?? "",
        country: p?.country ?? "Danmark",
      };
    },
  });

  const { data: avatarUrl } = useQuery({
    queryKey: ["avatar-url", profile?.discord_avatar_url, profile?.avatar_url],
    enabled: !!profile && (!!profile.discord_avatar_url || !!profile.avatar_url),
    queryFn: () => profile?.discord_avatar_url ?? signedAvatarUrl(profile!.avatar_url),
  });

  const [displayName, setDisplayName] = useState("");
  const [lmuName, setLmuName] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [achievements, setAchievements] = useState("");
  const [discord, setDiscord] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Danmark");
  const [acceptsDanish, setAcceptsDanish] = useState(false);
  const [mediaConsent, setMediaConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setLmuName(profile.lmu_name ?? "");
    setAge(profile.age != null ? String(profile.age) : "");
    setBio(profile.bio ?? "");
    setAchievements(profile.achievements ?? "");
    setDiscord(profile.discord_username ?? "");
    setAddress((profile as any).address ?? "");
    setPostalCode((profile as any).postal_code ?? "");
    setCity((profile as any).city ?? "");
    setCountry((profile as any).country || "Danmark");
    setAcceptsDanish((profile as any).accepts_danish === true);
    setMediaConsent((profile as any).media_consent === true);
  }, [profile]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = displayName.trim();
    const lmu = lmuName.trim();
    if (!name) return toast.error("Visningsnavn er påkrævet.");
    if (!lmu) return toast.error("LMU-navn er påkrævet.");
    const hasAnyAddress = !!(address.trim() || postalCode.trim() || city.trim());
    if (hasAnyAddress && (!address.trim() || !postalCode.trim() || !city.trim())) {
      return toast.error("Hvis du udfylder adresse, skal vej, postnummer og by alle udfyldes — eller lad alle felter være tomme.");
    }
    if (!acceptsDanish) return toast.error("Bekræft venligst at du kan læse og skrive dansk.");
    if (!mediaConsent) return toast.error("Du skal acceptere brug af navn/billeder på stream og SoMe.");
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
        accepts_danish: acceptsDanish,
        media_consent: mediaConsent,
      } as never)
      .eq("id", user.id);
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    const hasAddress = !!(address.trim() && postalCode.trim() && city.trim());
    const { error: privErr } = await (supabase as any)
      .from("profiles_private")
      .upsert({
        user_id: user.id,
        age: ageNum,
        discord_username: discord.trim() || null,
        address: hasAddress ? address.trim() : null,
        postal_code: hasAddress ? postalCode.trim() : null,
        city: hasAddress ? city.trim() : null,
        country: hasAddress ? (country.trim() || "Danmark") : null,
        address_consent_at: hasAddress ? new Date().toISOString() : null,
      }, { onConflict: "user_id" });
    setSaving(false);
    if (privErr) return toast.error(privErr.message);
    toast.success("Profil opdateret.");
    try {
      const res = await notifyAdminNameUpdated();
      console.log("notifyAdminNameUpdated result", res);
    } catch (err) {
      console.error("notifyAdminNameUpdated failed", err);
    }

    qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
    qc.invalidateQueries({ queryKey: ["onboarding-status", user.id] });
    if (window.history.length > 1) router.history.back();
  };



  if (isLoading) {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-muted-foreground">Indlæser…</div>;
  }

  const initials = (displayName || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* Hero header: avatar + navn + status — altid synlig */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:p-6">
        <Avatar className="h-20 w-20 shrink-0">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="Profilbillede" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h1 className="truncate text-xl font-bold sm:text-2xl">{displayName || "Min profil"}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {profile?.approved ? (
              <Badge variant="secondary" className="gap-1 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" /> Godkendt kører
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Afventer godkendelse</Badge>
            )}
            <Button asChild variant="outline" size="sm" className="h-7">
              <Link to="/arkiv">Mit arkiv</Link>
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="oversigt" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="oversigt">Oversigt</TabsTrigger>
          <TabsTrigger value="profil">Profil</TabsTrigger>
          <TabsTrigger value="forbindelser">Forbindelser</TabsTrigger>
        </TabsList>

        <TabsContent value="oversigt" className="mt-4 space-y-6">
          <MyRatingsCard userId={user?.id ?? null} />
          <MyTeamsCard userId={user?.id ?? null} />
        </TabsContent>

        <TabsContent value="profil" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Mine oplysninger</CardTitle>
              <CardDescription>LMU-navnet bruges til at koble løbsresultater til dig.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSave} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Visningsnavn</Label>
                    <Input value={displayName} readOnly disabled />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Synkroniseres fra dit Discord-servernavn. Skift det via <span className="font-medium text-foreground">"Skriv dit navn"</span> i #velkomst-kanalen.
                    </p>
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
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                  <div>
                    <Label className="text-sm font-semibold">Adresse <span className="text-xs font-normal text-muted-foreground">(valgfri — kun synlig for admins)</span></Label>
                    <p className="text-xs text-muted-foreground">
                      Helt valgfri. Bruges <span className="font-medium">kun</span> hvis du vinder en præmie og vi skal sende den til dig.
                      Slettes automatisk hvis din konto er inaktiv i mere end 1 år. Lad alle felter være tomme for at fjerne den.
                      Se <Link to="/privatlivspolitik" className="underline">privatlivspolitikken</Link>.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Adresse</Label>
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="Vej og husnummer" />
                    </div>
                    <div>
                      <Label>Postnummer</Label>
                      <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={20} />
                    </div>
                    <div>
                      <Label>By</Label>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Land</Label>
                      <Input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={100} />
                    </div>
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
                <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptsDanish}
                    onChange={(e) => setAcceptsDanish(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-primary"
                  />
                  <span className="text-sm">
                    Jeg bekræfter, at jeg kan <span className="font-medium">læse og skrive dansk</span>. Al kommunikation i ligaen foregår på dansk.
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mediaConsent}
                    onChange={(e) => setMediaConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-primary"
                  />
                  <span className="text-sm">
                    Jeg giver tilladelse til, at LMU Danmark må <span className="font-medium">anvende mit navn og eventuelle billeder/klip af mig på stream og sociale medier</span> i forbindelse med ligaens aktiviteter.
                  </span>
                </label>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Gem ændringer
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forbindelser" className="mt-4 space-y-6">
          <DiscordLinkCard />
          <DeviceTokensCard />
        </TabsContent>
      </Tabs>

      <DeleteAccountCard />
    </div>
  );

}

function DiscordLinkCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const start = useServerFn(startDiscordLink);
  const unlink = useServerFn(unlinkDiscord);
  const [busy, setBusy] = useState(false);

  const { data: link } = useQuery({
    queryKey: ["discord-link", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles_private")
        .select("discord_user_id, discord_username, discord_linked_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { discord_user_id: string | null; discord_username: string | null; discord_linked_at: string | null } | null;
    },
  });

  // Toast on return from OAuth
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const status = sp.get("discord");
    if (!status) return;
    if (status === "ok") toast.success("Discord-konto tilknyttet.");
    else if (status === "not_member") {
      const invite = sp.get("discord_invite") || "";
      toast.error(
        invite
          ? `Du er ikke medlem af LMU Danmark Discord. Tilmeld dig først: ${invite}`
          : "Du er ikke medlem af LMU Danmark Discord-serveren. Tilmeld dig først, og prøv så igen.",
        { duration: 10000 },
      );
    } else toast.error(`Kunne ikke tilknytte Discord: ${sp.get("discord_msg") ?? "ukendt fejl"}`);
    sp.delete("discord");
    sp.delete("discord_msg");
    sp.delete("discord_invite");
    const newUrl = window.location.pathname + (sp.toString() ? `?${sp}` : "");
    window.history.replaceState({}, "", newUrl);
    qc.invalidateQueries({ queryKey: ["discord-link", user?.id] });
  }, [qc, user?.id]);

  const onConnect = async () => {
    setBusy(true);
    try {
      const res = await start();
      window.location.href = res.url;
    } catch (e: any) {
      setBusy(false);
      toast.error(e?.message ?? "Kunne ikke starte Discord-login.");
    }
  };

  const onUnlink = async () => {
    setBusy(true);
    try {
      await unlink();
      toast.success("Discord-konto frakoblet.");
      qc.invalidateQueries({ queryKey: ["discord-link", user?.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke frakoble.");
    } finally {
      setBusy(false);
    }
  };

  const linked = !!link?.discord_user_id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Discord</CardTitle>
        <CardDescription>
          Forbind din Discord-konto, så du automatisk får tildelt den rigtige rolle på LMU Danmarks Discord-server, når du tilmelder dig en liga.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">{link?.discord_username ?? "Tilknyttet"}</div>
              <div className="text-xs text-muted-foreground">Discord-ID: {link?.discord_user_id}</div>
            </div>
            <Button variant="outline" size="sm" onClick={onUnlink} disabled={busy} className="gap-2">
              <Unlink className="h-4 w-4" /> Frakobl
            </Button>
          </div>
        ) : (
          <Button onClick={onConnect} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Forbind Discord
          </Button>
        )}
      </CardContent>
    </Card>
  );
}


function MyRatingsCard({ userId }: { userId: string | null }) {
  const { data: rating } = useQuery({
    queryKey: ["my-rating", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_ratings")
        .select("score,percentile,races_count")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as { score: number; percentile: number | null; races_count: number } | null;
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Min ELO-rating</CardTitle>
        <CardDescription>
          Én samlet ELO på tværs af alle klasser og ligaer. Top 5% = blå · top 25% = guld · top 50% = sølv · resten = bronze. Alle starter på 1500.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!rating ? (
          <p className="text-sm text-muted-foreground">Ingen rating endnu.</p>
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {rating.races_count} løb kørt
            </span>
            <RatingBadge
              score={Number(rating.score)}
              percentile={rating.percentile != null ? Number(rating.percentile) : null}
              confidence={1}
            />
          </div>
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
              Generér en adgangsnøgle som du paster ind i Leaderboard tracker LMU-appen på din PC. Den overvåger din LMU
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


function DeleteAccountCard() {
  const router = useRouter();
  const { signOut } = useAuth();
  const deleteFn = useServerFn(deleteMyAccount);
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    setBusy(true);
    try {
      await deleteFn({ data: undefined });
      toast.success("Din konto er slettet.");
      try { await signOut(); } catch { /* ignore */ }
      router.navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke slette konto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Slet min konto</CardTitle>
        <CardDescription>
          Sletter din konto og <span className="font-medium">alle</span> tilknyttede data permanent —
          profil, adresse, race-resultater, ratings, tilmeldinger, teams osv. Handlingen kan ikke fortrydes.
          Se <Link to="/privatlivspolitik" className="underline">privatlivspolitikken</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Slet min konto…</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Er du helt sikker?</AlertDialogTitle>
              <AlertDialogDescription>
                Dette sletter <span className="font-medium">permanent</span> din konto og alle tilknyttede data.
                Skriv <span className="font-mono font-semibold">SLET</span> for at bekræfte.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="SLET"
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Annuller</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy || confirmText !== "SLET"}
                onClick={(e) => { e.preventDefault(); void onDelete(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Slet konto permanent
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
