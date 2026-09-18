/** Supabase Auth, used only for the admin JWT (all data goes through the FastAPI backend). */
import { createClient, type Session as SupabaseSession } from "@supabase/supabase-js";
import { AuthError, type AuthProvider, type Session } from "./types";

function toSession(s: SupabaseSession | null): Session | null {
  return s ? { email: s.user.email ?? "", accessToken: s.access_token } : null;
}

export function createSupabaseAuth(url: string, anonKey: string): AuthProvider {
  const client = createClient(url, anonKey);
  return {
    async getSession() {
      const { data } = await client.auth.getSession();
      return toSession(data.session);
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      const session = toSession(data.session);
      if (error || !session) throw new AuthError(error?.message ?? "Sign-in failed");
      return session;
    },
    async signOut() {
      await client.auth.signOut();
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, s) => listener(toSession(s)));
      return () => data.subscription.unsubscribe();
    },
  };
}
