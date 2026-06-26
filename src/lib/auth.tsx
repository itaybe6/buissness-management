import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { FeatureKey, Profile } from "@/types/database";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** enabled feature keys for the current user's business */
  features: Set<FeatureKey>;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  hasFeature: (key: FeatureKey) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [features, setFeatures] = useState<Set<FeatureKey>>(new Set());
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string | undefined) {
    if (!userId) {
      setProfile(null);
      setFeatures(new Set());
      return;
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    setProfile((prof as Profile) ?? null);

    if (prof?.business_id) {
      const { data: feats } = await supabase
        .from("business_features")
        .select("feature_key, enabled")
        .eq("business_id", prof.business_id)
        .eq("enabled", true);
      setFeatures(new Set((feats ?? []).map((f) => f.feature_key as FeatureKey)));
    } else {
      // super admin (no business) — gets everything by default
      setFeatures(new Set());
    }
  }

  async function bootstrap(activeSession: Session | null) {
    setSession(activeSession);
    if (activeSession?.user) {
      await loadProfile(activeSession.user.id);
    } else {
      setProfile(null);
      setFeatures(new Set());
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      bootstrap(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      bootstrap(newSession);
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isSuperAdmin = profile?.role === "super_admin";
    const isBusinessManager = profile?.role === "manager" && !!profile.business_id;
    return {
      session,
      profile,
      features,
      loading,
      hasFeature: (key: FeatureKey) => isSuperAdmin || isBusinessManager || features.has(key),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ? translateAuthError(error.message) : null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        return { error: error ? error.message : null };
      },
      refresh: async () => {
        if (session?.user) await loadProfile(session.user.id);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profile, features, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "אימייל או סיסמה שגויים";
  if (m.includes("email not confirmed")) return "האימייל לא אומת";
  return "אירעה שגיאה בהתחברות";
}
