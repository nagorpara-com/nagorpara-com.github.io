import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Profile } from "../types/database.types";

interface AuthState {
  /** False until Supabase is connected (no fake login is provided). */
  isConfigured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isConfigured: false,
  loading: true,
  user: null,
  profile: null,
  signOut: async () => undefined,
});

/**
 * Auth foundation (Phase 2). Real login UI arrives in the Auth phase;
 * this provider only wires the Supabase session + profile (role) so the
 * Admin route guard can rely on it later. When Supabase is not configured
 * it resolves to "not logged in" instead of throwing.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;

    let cancelled = false;

    const loadProfile = async (session: Session | null) => {
      if (!session?.user) {
        if (!cancelled) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await client
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (!cancelled) {
        setUser(session.user);
        setProfile((data as Profile | null) ?? null);
        setLoading(false);
      }
    };

    client.auth.getSession().then(({ data }) => loadProfile(data.session));
    const { data: listener } = client.auth.onAuthStateChange(
      (_event, session) => {
        void loadProfile(session);
      },
    );
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        isConfigured: isSupabaseConfigured,
        loading,
        user,
        profile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
