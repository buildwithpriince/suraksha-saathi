/**
 * Public /verify (docs/08): scan or paste a certificate, check it in the browser with the root key
 * first (works offline), then ask /v1/public/verify for the live revocation status when online.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ApiError, backend, type PublicVerify } from "../../api";
import { formatDate, formatRelative, scenarioName } from "../../components/format";
import { DemoBanner } from "../../components/Layout";
import { statusLabel, verifyCertificate, type CertificateVerification, type StatusTone, type VerifyStatus } from "../../lib/cert";
import { QrScanner } from "./QrScanner";
import { readCachedRevocations, storeRevocations } from "./revocationCache";

interface Shown {
  status: VerifyStatus;
  workerName?: string;
  site?: string;
  modules?: { id: string; score: number }[];
  issuedAt?: number;
  expiresAt?: number;
}

interface CheckState {
  offline: CertificateVerification | null; // null: no root key in this build
  online: PublicVerify | null;
  onlineState: "checking" | "done" | "offline" | "failed";
  revocationsIat: number | null;
}

const REASONS: Partial<Record<VerifyStatus, string>> = {
  INVALID_FORMAT: "This isn't a readable Suraksha Saathi certificate.",
  INVALID_ATTESTATION: "The kiosk that issued this certificate isn't approved by the root key.",
  INVALID_SIGNATURE: "The signature doesn't match: the certificate may have been altered.",
  EXPIRED: "This certificate has expired. The worker needs to re-certify.",
  REVOKED: "An administrator has revoked this certificate.",
};

const TONE: Record<StatusTone, { card: string; icon: string }> = {
  green: { card: "border-green-600 bg-green-50 text-green-900", icon: "✓" },
  amber: { card: "border-amber-500 bg-amber-50 text-amber-900", icon: "!" },
  red: { card: "border-fail bg-red-50 text-fail", icon: "✕" },
};

function fromOffline(r: CertificateVerification): Shown {
  const c = r.certificate;
  return c
    ? { status: r.status, workerName: c.wn, site: c.site, modules: c.mods.map((m) => ({ id: m.id, score: m.s })), issuedAt: c.iat, expiresAt: c.exp }
    : { status: r.status };
}

export function VerifyPage() {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("token") ?? "");
  const [scanning, setScanning] = useState(false);
  const [check, setCheck] = useState<CheckState | null>(null);
  const latestRun = useRef(0);

  const verify = useCallback(async (raw: string) => {
    const token = raw.trim();
    if (!token) return;
    // A newer check (another scan or paste) makes this one's late results irrelevant
    const run = ++latestRun.current;
    const update = (next: (s: CheckState | null) => CheckState | null) => run === latestRun.current && setCheck(next);
    const root = backend.rootPublicKey;
    const now = () => Math.floor(Date.now() / 1000);
    const offlineCheck = async (list: string | null) => (root ? verifyCertificate(token, { rootPublicKey: root, now: now(), revocationList: list }) : null);

    // 1. In the browser, with whatever revocation list this device already has
    let cached = readCachedRevocations();
    const online = typeof navigator === "undefined" || navigator.onLine;
    const first = await offlineCheck(cached?.token ?? null);
    update(() => ({ offline: first, online: null, onlineState: online ? "checking" : "offline", revocationsIat: cached?.iat ?? null }));
    if (!online) return;

    // 2. Refresh the list (kept only if root-signed), re-check, then ask the server
    try {
      if (root) {
        cached = await storeRevocations((await backend.api.revocations()).token, root);
        const offline = await offlineCheck(cached?.token ?? null);
        update((s) => s && { ...s, offline, revocationsIat: cached?.iat ?? null });
      }
      const result = await backend.api.publicVerify(token);
      update((s) => s && { ...s, online: result, onlineState: "done" });
    } catch (e) {
      const offlineNow = e instanceof ApiError && e.status === 0;
      update((s) => s && { ...s, onlineState: offlineNow ? "offline" : "failed" });
    }
  }, []);

  // A token in the URL (e.g. from a worker's page) is checked right away
  useEffect(() => {
    const token = params.get("token");
    if (token) void verify(token);
    // once, on load; later checks come from the form or the scanner
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (params.has("token")) setParams({}, { replace: true });
    void verify(input);
  }

  // The server's answer (live revocations) wins; the offline result shows until it arrives
  const shown: Shown | null = check?.online ?? (check?.offline ? fromOffline(check.offline) : null);

  return (
    <div className="min-h-screen bg-slate-50">
      <DemoBanner />
      <header className="bg-navy px-4 py-4 text-white">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-8 w-8 rounded bg-white p-0.5" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Verify a certificate</h1>
            <p className="text-xs text-blue-200">Suraksha Saathi safety training</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 py-6">
        {scanning ? (
          <QrScanner
            onClose={() => setScanning(false)}
            onScan={(text) => {
              setScanning(false);
              setInput(text);
              void verify(text);
            }}
          />
        ) : (
          <button type="button" className="btn-primary w-full py-3 text-base" onClick={() => setScanning(true)}>
            Scan QR code with camera
          </button>
        )}

        <form onSubmit={submit} className="space-y-2">
          <label htmlFor="token" className="block text-sm font-medium text-slate-700">
            Or paste the certificate text
          </label>
          <textarea
            id="token"
            rows={3}
            className="input font-mono text-xs"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="SS1.…"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button type="submit" className="btn-secondary w-full" disabled={!input.trim()}>
            Check
          </button>
        </form>

        {check && (
          <section aria-live="polite" className="space-y-3">
            {shown ? (
              <StatusCard shown={shown} />
            ) : (
              <p role="status" className="rounded-md bg-white p-4 text-sm text-slate-600 shadow-sm">
                {check.onlineState === "checking" ? "Checking online…" : "Couldn't check this certificate: go online and try again."}
              </p>
            )}
            <CheckDetails check={check} />
          </section>
        )}
      </main>
    </div>
  );
}

function StatusCard({ shown }: { shown: Shown }) {
  const { label, tone } = statusLabel(shown.status);
  const style = TONE[tone];
  return (
    <div role="status" aria-label={`Certificate status: ${label}`} className={`rounded-xl border-l-8 p-5 shadow-sm ${style.card}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl font-bold">
          {style.icon}
        </span>
        <span className="text-4xl font-bold">{label}</span>
      </div>
      {REASONS[shown.status] && <p className="mt-3 text-sm">{REASONS[shown.status]}</p>}
      {shown.workerName && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm text-slate-800">
          <dt className="text-slate-500">Worker</dt>
          <dd className="text-lg font-semibold">{shown.workerName}</dd>
          <dt className="text-slate-500">Site</dt>
          <dd>{shown.site}</dd>
          <dt className="text-slate-500">Modules</dt>
          <dd>
            <ul>
              {shown.modules?.map((m) => (
                <li key={m.id}>
                  {scenarioName(m.id)} · <span className="font-semibold">{m.score}%</span>
                </li>
              ))}
            </ul>
          </dd>
          <dt className="text-slate-500">Issued</dt>
          <dd>{formatDate(shown.issuedAt)}</dd>
          <dt className="text-slate-500">Expires</dt>
          <dd>{formatDate(shown.expiresAt)}</dd>
        </dl>
      )}
    </div>
  );
}

function CheckDetails({ check }: { check: CheckState }) {
  const offlineStatus = check.offline?.status;
  const disagree = check.online && offlineStatus && check.online.status !== offlineStatus;
  return (
    <ul className="space-y-1 rounded-md bg-white p-4 text-xs text-slate-600 shadow-sm">
      <li>
        {check.offline
          ? `Checked on this device: ${statusLabel(check.offline.status).label}`
          : "This build has no root key yet, so the on-device check is unavailable."}
      </li>
      <li>
        {check.onlineState === "checking" && "Checking live status online…"}
        {check.onlineState === "done" && check.online && `Checked online: ${statusLabel(check.online.status).label}${disagree ? " (live revocation list is newer)" : ""}`}
        {check.onlineState === "offline" && "Offline: showing the on-device check only."}
        {check.onlineState === "failed" && "The online check failed: showing the on-device check only."}
      </li>
      <li>
        {check.revocationsIat !== null
          ? `Revocation list updated ${formatRelative(check.revocationsIat)}`
          : "Revocation status unknown (offline, no list)"}
      </li>
    </ul>
  );
}
