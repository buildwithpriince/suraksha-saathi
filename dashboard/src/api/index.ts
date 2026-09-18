/**
 * THE backend switch. With VITE_API_BASE_URL, VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set, the
 * dashboard talks to the deployed FastAPI backend and signs in with Supabase. With none of them set,
 * it runs against an in-browser mock of docs/06 with demo data and demo accounts (TEST keys only).
 * Nothing else in the app knows which one is in use, except the "Demo data" banner.
 */
import { createMockAuth } from "../auth/mock";
import { createSupabaseAuth } from "../auth/supabase";
import type { AuthProvider } from "../auth/types";
import { publicKeyFromB64url } from "../lib/cert";
import { COMMITTED_ROOT_PUBLIC_KEY } from "../lib/cert/trust";
import { createHttpApi } from "./http";
import { TEST_ROOT_PUBLIC_KEY } from "./mock/data";
import { createMockApi } from "./mock";
import type { ApiClient } from "./types";

export interface Backend {
  mode: "live" | "mock";
  api: ApiClient;
  auth: AuthProvider;
  /** Root key for the offline certificate check; null if the committed key is still a placeholder. */
  rootPublicKey: Uint8Array | null;
}

function createBackend(): Backend {
  const env = import.meta.env;
  const apiBase = env.VITE_API_BASE_URL as string | undefined;
  const supabaseUrl = env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (apiBase && supabaseUrl && supabaseKey) {
    const auth = createSupabaseAuth(supabaseUrl, supabaseKey);
    const api = createHttpApi(apiBase, async () => (await auth.getSession())?.accessToken ?? null);
    return { mode: "live", api, auth, rootPublicKey: COMMITTED_ROOT_PUBLIC_KEY };
  }
  const auth = createMockAuth();
  const api = createMockApi({ account: () => auth.account() });
  return { mode: "mock", api, auth, rootPublicKey: publicKeyFromB64url(TEST_ROOT_PUBLIC_KEY) };
}

export const backend: Backend = createBackend();
export const api = backend.api;
export * from "./types";
