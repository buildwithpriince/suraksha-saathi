/** Demo accounts for mock mode. The mock API reads the signed-in account to apply its role. */
import { AuthError, type AuthProvider, type Session } from "./types";

export interface MockAccount {
  email: string;
  role: "admin" | "supervisor";
  siteIds: string[]; // site codes a supervisor sees
}

export const MOCK_PASSWORD = "demo1234";
export const MOCK_ACCOUNTS: MockAccount[] = [
  { email: "admin@demo.suraksha", role: "admin", siteIds: [] },
  { email: "supervisor@demo.suraksha", role: "supervisor", siteIds: ["DHN-01"] },
];

const STORAGE_KEY = "ss.mockSession";

export function createMockAuth(): AuthProvider & { account(): MockAccount | null } {
  const listeners = new Set<(s: Session | null) => void>();
  let current: Session | null = null;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved && MOCK_ACCOUNTS.some((a) => a.email === saved)) {
      current = { email: saved, accessToken: `mock:${saved}` };
    }
  } catch {
    // storage blocked: sign in again
  }

  const set = (s: Session | null) => {
    current = s;
    try {
      if (s) sessionStorage.setItem(STORAGE_KEY, s.email);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage blocked: session lasts for this page only
    }
    listeners.forEach((l) => l(s));
  };

  return {
    async getSession() {
      return current;
    },
    async signIn(email, password) {
      const account = MOCK_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase());
      if (!account || password !== MOCK_PASSWORD) throw new AuthError("Invalid login credentials");
      const session = { email: account.email, accessToken: `mock:${account.email}` };
      set(session);
      return session;
    },
    async signOut() {
      set(null);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    account() {
      return MOCK_ACCOUNTS.find((a) => a.email === current?.email) ?? null;
    },
  };
}
