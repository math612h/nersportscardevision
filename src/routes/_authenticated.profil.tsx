import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({ meta: [{ title: "Min profil – LMU-Hub" }] }),
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
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, lmu_name, age, bio, achievements, avatar_url, discord_username")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
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
        age: ageNum,
        bio: bio.trim() || null,
        achievements: achievements.trim() || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profil opdateret.");
    qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
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
          <CardTitle>Min profil</CardTitle>
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
    </div>
  );
}
