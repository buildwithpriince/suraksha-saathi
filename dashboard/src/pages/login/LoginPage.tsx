import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { backend } from "../../api";
import { MOCK_ACCOUNTS, MOCK_PASSWORD } from "../../auth/mock";
import { useAuth } from "../../auth/AuthContext";
import { DemoBanner } from "../../components/Layout";

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-navy">
      <DemoBanner />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl">
          <div className="mb-6 flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-10 w-10" />
            <div>
              <h1 className="text-xl font-semibold text-navy">Suraksha Saathi</h1>
              <p className="text-sm text-slate-600">Sign in to the compliance dashboard</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1" />
            </label>
            {error && (
              <p role="alert" className="text-sm text-fail">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {backend.mode === "mock" && (
            <div className="mt-6 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              <p className="mb-2 font-medium text-slate-700">Demo accounts (password {MOCK_PASSWORD})</p>
              <ul className="space-y-1">
                {MOCK_ACCOUNTS.map((a) => (
                  <li key={a.email}>
                    <button
                      type="button"
                      className="text-brand underline underline-offset-2"
                      onClick={() => {
                        setEmail(a.email);
                        setPassword(MOCK_PASSWORD);
                      }}
                    >
                      {a.email}
                    </button>{" "}
                    — {a.role}
                    {a.siteIds.length ? ` (${a.siteIds.join(", ")})` : " (all sites)"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-6 text-center text-sm">
            <a href="/verify" className="text-brand underline underline-offset-2">
              Verify a certificate without signing in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
