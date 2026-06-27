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
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  isAdmin: false,
  isGuest: false,
  isCoach: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    let mounted = true;

    const applySession = async (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id);
        if (mounted) {
          setIsAdmin(!!data?.some((r) => r.role === "admin"));
          setIsGuest(!!data?.some((r) => r.role === "guest"));
        }
      } else {
        setIsAdmin(false);
        setIsGuest(false);
      }
      if (mounted) setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setTimeout(() => { void applySession(s).catch(() => mounted && setLoading(false)); }, 0);
      router.invalidate();
      qc.invalidateQueries();
    });

    supabase.auth.getSession()
      .then(({ data: { session: s } }) => applySession(s))
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [router, qc]);

  return (
    <AuthContext.Provider
      value={{ user, session, isAdmin, isGuest, loading, signOut: async () => { await supabase.auth.signOut(); } }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
