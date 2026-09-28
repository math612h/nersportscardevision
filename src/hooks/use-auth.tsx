import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isGuest: boolean;
  isCoach: boolean;
  isSteward: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  isAdmin: false,
  isGuest: false,
  isCoach: false,
  isSteward: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isCoach, setIsCoach] = useState(false);
  const [isSteward, setIsSteward] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    let mounted = true;
    let lastUserId: string | null | undefined = undefined;

    const applySession = async (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const sameUser = lastUserId === s.user.id;
        lastUserId = s.user.id;
        // Ved ny bruger: hold loading, indtil rollerne er hentet, så vagter ikke omdirigerer for tidligt.
        if (!sameUser) setLoading(true);
        const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id);
        // Ved fejl beholdes de kendte roller i stedet for at nedgradere brugeren.
        if (mounted && !error) {
          setIsAdmin(!!data?.some((r) => r.role === "admin"));
          setIsGuest(!!data?.some((r) => r.role === "guest"));
          setIsCoach(!!data?.some((r) => r.role === "coach"));
          setIsSteward(!!data?.some((r) => r.role === "steward"));
        }
      } else {
        lastUserId = null;
        setIsAdmin(false);
        setIsGuest(false);
        setIsCoach(false);
        setIsSteward(false);
      }
      if (mounted) setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      const identityChanged = (s?.user?.id ?? null) !== (lastUserId ?? null);
      setTimeout(() => { void applySession(s).catch(() => mounted && setLoading(false)); }, 0);
      // Kun ved reelle login/logud-skift — ikke ved automatisk sessionsfornyelse.
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      if (!identityChanged && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") qc.invalidateQueries();
    });

    supabase.auth.getSession()
      .then(({ data: { session: s } }) => applySession(s))
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [router, qc]);

  return (
    <AuthContext.Provider
      value={{ user, session, isAdmin, isGuest, isCoach, isSteward, loading, signOut: async () => { await supabase.auth.signOut(); } }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
