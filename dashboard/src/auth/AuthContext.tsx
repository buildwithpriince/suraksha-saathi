import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import type { AuthProvider, Session } from "./types";

interface AuthState {
  session: Session | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProviderView({ provider, children }: { provider: AuthProvider; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let live = true;
    void provider.getSession().then((s) => {
      if (!live) return;
      setSession(s);
      setLoading(false);
    });
    const unsubscribe = provider.onChange((s) => {
      setSession(s);
      if (!s) queryClient.clear(); // never show one user's data to the next
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [provider, queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      signIn: async (email, password) => setSession(await provider.signIn(email, password)),
      signOut: async () => {
        await provider.signOut();
        setSession(null);
        queryClient.clear();
      },
    }),
    [session, loading, provider, queryClient],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProviderView");
  return ctx;
}

/** Admin and supervisor routes: redirect to /login, then back to where the user was going. */
export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="p-8 text-slate-500" role="status">Checking your session…</div>;
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
