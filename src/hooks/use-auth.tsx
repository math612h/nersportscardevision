import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    let mounted = true;

    const applySession = (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s?.user) {
        void supabase.from("user_roles").select("role").eq("user_id", s.user.id).then(({ data }) => {
          if (mounted) setIsAdmin(!!data?.some((r) => r.role === "admin"));
        });
      } else {
        setIsAdmin(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setTimeout(() => applySession(s), 0);
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
      value={{ user, session, isAdmin, loading, signOut: async () => { await supabase.auth.signOut(); } }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
