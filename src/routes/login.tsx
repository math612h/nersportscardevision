import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import logoAsset from "@/assets/lmu-logo.png.asset.json";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log ind – LMU Danmark" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/" });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Surface error returned by Discord callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("discord") === "error") {
      toast.error(`Discord login fejlede: ${sp.get("discord_msg") ?? "ukendt fejl"}`);
      sp.delete("discord");
      sp.delete("discord_msg");
      const newUrl = window.location.pathname + (sp.toString() ? `?${sp}` : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
  };

  const onDiscord = () => {
    window.location.href = "/api/public/discord/login";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Toaster />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center">
            <img src={logoAsset.url} alt="LMU Danmark" className="h-16 w-16 object-contain" />
          </div>
          <CardTitle>LMU Danmark</CardTitle>
          <CardDescription>Log ind eller opret konto med Discord</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={onDiscord}
            className="w-full gap-2 bg-[#5865F2] text-white hover:bg-[#4752C4]"
            size="lg"
          >
            <MessageSquare className="h-5 w-5" />
            Fortsæt med Discord
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Nye konti skal oprettes med Discord. Bagefter udfylder du email, navn og LMU-navn.
          </p>

          <div className="pt-2">
            {!showLegacy ? (
              <button
                type="button"
                onClick={() => setShowLegacy(true)}
                className="block w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Eksisterende bruger uden Discord? Log ind med email
              </button>
            ) : (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Du skal stadig tilknytte Discord bagefter for at bruge siden.
                </p>
                <form onSubmit={onLogin} className="space-y-3">
                  <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label>Adgangskode</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={loading} variant="outline">Log ind</Button>
                </form>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
