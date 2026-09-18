export interface Session {
  email: string;
  accessToken: string;
}

/** Supabase email/password in live mode; built-in demo accounts in mock mode. */
export interface AuthProvider {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  /** Returns an unsubscribe function. */
  onChange(listener: (session: Session | null) => void): () => void;
}

export class AuthError extends Error {}
