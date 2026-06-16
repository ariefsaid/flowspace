"use client";

/**
 * Client-side session context backed by Supabase Auth (ADR-0014).
 *
 * Replaces the next-auth/react `SessionProvider`/`useSession`. It exposes only
 * what the chrome needs — the signed-in user's display `name` and a `signOut()` —
 * read from the Supabase browser client. This is UX-only: it is NOT an
 * authorization boundary (the middleware + org-scoped repository are; ADR-0004).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SessionContextValue = {
  /** Display name from the auth user's metadata, or null when signed out. */
  name: string | null;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    function nameFromUser(
      user: { user_metadata?: Record<string, unknown>; email?: string } | null,
    ): string | null {
      if (!user) return null;
      const meta = (user.user_metadata?.name ?? user.user_metadata?.full_name) as
        | string
        | undefined;
      return meta ?? user.email ?? null;
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setName(nameFromUser(data.user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setName(nameFromUser(session?.user ?? null));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<SessionContextValue>(
    () => ({
      name,
      async signOut() {
        await supabase.auth.signOut();
        window.location.href = "/login";
      },
    }),
    [name, supabase],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/** Read the Supabase-backed session context (display name + signOut). */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
