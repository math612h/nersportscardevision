import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log ind – LMU Danmark" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [lmuName, setLmuName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/" });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    const lmu = lmuName.trim();
    const mail = email.trim();
    if (!name) { toast.error("Indtast dit visningsnavn."); return; }
    if (!lmu) { toast.error("Indtast dit LMU-navn præcis som det står i Le Mans Ultimate."); return; }
    if (!mail) { toast.error("Indtast din email."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { toast.error("Indtast en gyldig email-adresse."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: mail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: name, lmu_name: lmu },
      },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Konto oprettet – du er logget ind.");
  };

  const onGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google login fejlede");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Toaster />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Flag className="h-6 w-6" />
          </div>
          <CardTitle>LMU Danmark</CardTitle>
          <CardDescription>Sim-racing administration</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Log ind</TabsTrigger>
              <TabsTrigger value="signup">Opret konto</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-3">
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Adgangskode</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>Log ind</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={onSignup} className="space-y-3">
                <div><Label>Visningsnavn</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Kørernavn" required maxLength={80} /></div>
                <div>
                  <Label>LMU-navn</Label>
                  <Input value={lmuName} onChange={(e) => setLmuName(e.target.value)} placeholder="Som det står i Le Mans Ultimate" required maxLength={80} />
                  <p className="mt-1 text-xs text-muted-foreground">Skal matche dit navn i spillet 100% – bruges til at koble løbsresultater til din konto.</p>
                </div>
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Adgangskode</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>Opret konto</Button>
              </form>
            </TabsContent>
          </Tabs>
          <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> eller <div className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={onGoogle}>
            Fortsæt med Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
