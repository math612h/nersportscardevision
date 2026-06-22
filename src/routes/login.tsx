import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageSquare, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import logoAsset from "@/assets/lmu-logo.png.asset.json";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { resolveGuestCode } from "@/lib/guest-codes.functions";
import { LoginLanguageSelector } from "@/components/GuestLanguageSwitcher";
import {
  SUPPORTED_LANGUAGES,
  GUEST_LANG_STORAGE_KEY,
  type LanguageCode,
} from "@/i18n";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log ind – LMU Danmark" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [notMemberInvite, setNotMemberInvite] = useState<string | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestCode, setGuestCode] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestLang, setGuestLang] = useState<LanguageCode>("en");
  const resolveGuestFn = useServerFn(resolveGuestCode);

  // Initialize from any previously stored guest language
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(GUEST_LANG_STORAGE_KEY) as LanguageCode | null;
    if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) setGuestLang(stored);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/" });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const status = sp.get("discord");
    if (status === "not_member") {
      setNotMemberInvite(sp.get("discord_invite") || "https://discord.gg/bwVMAfrm55");
      sp.delete("discord");
      sp.delete("discord_invite");
      const newUrl = window.location.pathname + (sp.toString() ? `?${sp}` : "");
      window.history.replaceState({}, "", newUrl);
    } else if (status === "error") {
      toast.error(`Discord login: ${sp.get("discord_msg") ?? "error"}`);
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
          <CardTitle>{t("login.title")}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notMemberInvite ? (
            <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <p className="font-medium text-foreground">{t("login.notMemberTitle")}</p>
              <p className="text-muted-foreground">{t("login.notMemberDesc")}</p>
              <Button asChild className="w-full gap-2 bg-[#5865F2] text-white hover:bg-[#4752C4]">
                <a href={notMemberInvite} target="_blank" rel="noopener noreferrer">
                  <MessageSquare className="h-4 w-4" /> {t("login.joinDiscord")}
                </a>
              </Button>
            </div>
          ) : null}
          <Button
            onClick={onDiscord}
            className="w-full gap-2 bg-[#5865F2] text-white hover:bg-[#4752C4]"
            size="lg"
          >
            <MessageSquare className="h-5 w-5" />
            {t("login.continueDiscord")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t("login.discordHint")}
          </p>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t("login.or")}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={() => setGuestOpen(true)}
          >
            <KeyRound className="h-4 w-4" />
            {t("login.guestLogin")}
          </Button>


          <div className="pt-2">
            {!showLegacy ? (
              <button
                type="button"
                onClick={() => setShowLegacy(true)}
                className="block w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                {t("login.legacyToggle")}
              </button>
            ) : (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  {t("login.legacyHint")}
                </p>
                <form onSubmit={onLogin} className="space-y-3">
                  <div><Label>{t("login.email")}</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label>{t("login.password")}</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={loading} variant="outline">{t("login.signIn")}</Button>
                </form>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={guestOpen} onOpenChange={(v) => { setGuestOpen(v); if (!v) setGuestCode(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("login.guestDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("login.guestDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const code = guestCode.trim().toUpperCase();
              if (!code) return;
              setGuestLoading(true);
              try {
                // Persist chosen guest language BEFORE auth-driven navigation
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(GUEST_LANG_STORAGE_KEY, guestLang);
                }
                void i18n.changeLanguage(guestLang);
                const { email: guestEmail } = await resolveGuestFn({ data: { code } });
                const { error } = await supabase.auth.signInWithPassword({ email: guestEmail, password: code });
                if (error) throw error;
                setGuestOpen(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t("login.loginFailed"));
              } finally {
                setGuestLoading(false);
              }
            }}
            className="space-y-3"
          >
            <div>
              <Label>{t("login.language")}</Label>
              <div className="mt-1.5">
                <LoginLanguageSelector value={guestLang} onChange={setGuestLang} />
              </div>
            </div>
            <div>
              <Label>{t("login.guestCodeLabel")}</Label>
              <Input
                value={guestCode}
                onChange={(e) => setGuestCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH-IJKL"
                autoFocus
                className="font-mono tracking-wider"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGuestOpen(false)}>{t("login.cancel")}</Button>
              <Button type="submit" disabled={guestLoading || !guestCode.trim()}>
                {guestLoading ? t("login.signingIn") : t("login.signIn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
