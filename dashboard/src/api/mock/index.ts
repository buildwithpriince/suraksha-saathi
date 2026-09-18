/**
 * In-browser stand-in for the docs/06 admin + public API, used while no backend is deployed.
 * Follows the D-025 rules: supervisor scoping (out-of-scope ids are 404), admin-only devices (403),
 * 25 per page, newest first, certStatus/passRate rules, SR1 re-signed on revoke.
 */
import { publicKeyFromB64url, verifyCertificate } from "../../lib/cert";
import type { MockAccount } from "../../auth/mock";
import {
  ApiError,
  PAGE_SIZE,
  type ApiClient,
  type AttemptSummary,
  type CertStatus,
  type CertificateItem,
  type Device,
  type Paged,
  type WorkerCertStatus,
} from "../types";
import {
  DAY,
  SCENARIOS,
  TEST_ROOT_PUBLIC_KEY,
  buildMockDb,
  roundHalfAway,
  signRevocations,
  type MockAttempt,
  type MockCertificate,
  type MockDb,
  type MockDevice,
  type MockWorker,
} from "./data";

const EXPIRING_WINDOW = 30 * DAY;
const BEST_FIRST: CertStatus[] = ["valid", "expiring", "expired", "revoked"];

export function certStatus(c: Pick<MockCertificate, "expiresAt" | "revokedAt">, now: number): CertStatus {
  if (c.revokedAt !== null) return "revoked";
  if (now > c.expiresAt) return "expired";
  if (c.expiresAt - now <= EXPIRING_WINDOW) return "expiring";
  return "valid";
}

function page<T>(items: T[], p = 1): Paged<T> {
  const start = (Math.max(1, p) - 1) * PAGE_SIZE;
  return { items: items.slice(start, start + PAGE_SIZE), total: items.length };
}

const percent = (part: number, whole: number) => (whole ? roundHalfAway((100 * part) / whole) : 0);

const notFound = () => new ApiError(404, "not_found", "Not found");

export interface MockApiOptions {
  account: () => MockAccount | null;
  /** Simulated network latency in ms, so loading states show. */
  latencyMs?: number;
  now?: () => number;
  db?: Promise<MockDb>;
}

export function createMockApi({ account, latencyMs = 250, now = () => Math.floor(Date.now() / 1000), db: dbPromise }: MockApiOptions): ApiClient {
  let dbCache: Promise<MockDb> | undefined = dbPromise;
  const load = () => (dbCache ??= buildMockDb());
  const delay = () => new Promise((r) => setTimeout(r, latencyMs));

  /** Admin call: waits, checks the signed-in account, returns the db and a site filter. */
  async function admin(adminOnly = false) {
    await delay();
    const user = account();
    if (!user) throw new ApiError(401, "unauthorized", "Not signed in");
    if (adminOnly && user.role !== "admin") throw new ApiError(403, "forbidden", "Admins only");
    const db = await load();
    const inScope = (site: string) => user.role === "admin" || user.siteIds.includes(site);
    return { db, inScope, t: now() };
  }

  const workerById = (db: MockDb, id: string) => db.workers.find((w) => w.id === id);

  function summary(db: MockDb, a: MockAttempt): AttemptSummary {
    return {
      id: a.id, workerId: a.workerId, workerName: workerById(db, a.workerId)?.displayName ?? "",
      site: a.site, scenarioId: a.scenarioId, variant: a.variant, mode: a.mode,
      scorePercent: a.scorePercent, passed: a.passed, flagged: a.flagged, startedAt: a.startedAt,
    };
  }

  function workerCertStatus(db: MockDb, w: MockWorker, t: number): WorkerCertStatus {
    const statuses = db.certificates.filter((c) => c.workerId === w.id).map((c) => certStatus(c, t));
    return BEST_FIRST.find((s) => statuses.includes(s)) ?? "none";
  }

  function certItem(db: MockDb, c: MockCertificate, t: number): CertificateItem {
    const w = workerById(db, c.workerId)!;
    return {
      id: c.id, worker: { id: w.id, displayName: w.displayName, site: w.site }, issuedAt: c.issuedAt,
      expiresAt: c.expiresAt, status: certStatus(c, t), revokedAt: c.revokedAt, revokedReason: c.revokedReason,
    };
  }

  const device = ({ registeredAt: _r, ...d }: MockDevice): Device => d;

  function recertDue(db: MockDb, inScope: (s: string) => boolean, t: number, days: number) {
    return db.workers
      .filter((w) => inScope(w.site))
      .flatMap((w) => {
        const newest = db.certificates.filter((c) => c.workerId === w.id && c.revokedAt === null).sort((a, b) => b.issuedAt - a.issuedAt)[0];
        if (!newest) return [];
        const daysLeft = Math.floor((newest.expiresAt - t) / DAY);
        return daysLeft >= 0 && daysLeft <= days ? [{ workerId: w.id, displayName: w.displayName, site: w.site, expiresAt: newest.expiresAt, daysLeft }] : [];
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }

  function certifiedPercent(db: MockDb, workers: MockWorker[], t: number) {
    const certified = workers.filter((w) => ["valid", "expiring"].includes(workerCertStatus(db, w, t))).length;
    return percent(certified, workers.length);
  }

  return {
    async overview() {
      const { db, inScope, t } = await admin();
      const workers = db.workers.filter((w) => inScope(w.site));
      const attempts = db.attempts.filter((a) => inScope(a.site));
      const failures = new Map<string, { ruleId: string; scenarioId: string; failures: number }>();
      for (const a of attempts) {
        for (const r of a.result.rules ?? []) {
          if (r.passed) continue;
          const key = `${a.scenarioId}/${r.ruleId}`;
          const row = failures.get(key) ?? { ruleId: r.ruleId, scenarioId: a.scenarioId, failures: 0 };
          row.failures++;
          failures.set(key, row);
        }
      }
      return {
        workers: workers.length,
        certifiedPercent: certifiedPercent(db, workers, t),
        attempts7d: attempts.filter((a) => a.startedAt >= t - 7 * DAY).length,
        recertDue30d: recertDue(db, inScope, t, 30).length,
        topFailedRules: [...failures.values()].sort((a, b) => b.failures - a.failures || a.ruleId.localeCompare(b.ruleId)).slice(0, 5),
      };
    },

    async sites() {
      const { db, inScope, t } = await admin();
      return db.sites.filter((s) => inScope(s.code)).map((s) => {
        const workers = db.workers.filter((w) => w.site === s.code);
        return { ...s, workers: workers.length, certifiedPercent: certifiedPercent(db, workers, t) };
      });
    },

    async heatmap() {
      const { db, inScope } = await admin();
      const sites = db.sites.map((s) => s.code).filter(inScope);
      const scenarios = SCENARIOS.map((s) => s.id).sort();
      const cells = sites.flatMap((site) =>
        scenarios.map((scenario) => {
          const rows = db.attempts.filter((a) => a.site === site && a.scenarioId === scenario);
          return { site, scenario, attempts: rows.length, passRate: rows.length ? percent(rows.filter((a) => a.passed).length, rows.length) : null };
        }),
      );
      return { sites, scenarios, cells };
    },

    async workers({ site, q, page: p }) {
      const { db, inScope, t } = await admin();
      const needle = q?.trim().toLowerCase();
      const rows = db.workers
        .filter((w) => inScope(w.site) && (!site || w.site === site))
        .filter((w) => !needle || w.displayName.toLowerCase().includes(needle) || (w.employeeCode ?? "").toLowerCase().includes(needle))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((w) => ({
          id: w.id, displayName: w.displayName, site: w.site, certStatus: workerCertStatus(db, w, t),
          lastAttemptAt: db.attempts.find((a) => a.workerId === w.id)?.startedAt ?? null,
        }));
      return page(rows, p);
    },

    async worker(id) {
      const { db, inScope, t } = await admin();
      const w = workerById(db, id);
      if (!w || !inScope(w.site)) throw notFound();
      return {
        ...w,
        certStatus: workerCertStatus(db, w, t),
        attempts: db.attempts.filter((a) => a.workerId === id).map((a) => summary(db, a)),
        certificates: db.certificates.filter((c) => c.workerId === id).map((c) => ({ id: c.id, issuedAt: c.issuedAt, expiresAt: c.expiresAt, status: certStatus(c, t), token: c.token })),
      };
    },

    async attempts({ scenario, passed, flagged, site, page: p }) {
      const { db, inScope } = await admin();
      const rows = db.attempts.filter(
        (a) =>
          inScope(a.site) &&
          (!scenario || a.scenarioId === scenario) &&
          (passed === undefined || a.passed === passed) &&
          (flagged === undefined || a.flagged === flagged) &&
          (!site || a.site === site),
      );
      return page(rows.map((a) => summary(db, a)), p);
    },

    async attempt(id) {
      const { db, inScope } = await admin();
      const a = db.attempts.find((x) => x.id === id);
      if (!a || !inScope(a.site)) throw notFound();
      return { ...summary(db, a), durationSec: a.durationSec, flagReason: a.flagReason, result: a.result, events: a.events };
    },

    async certificates({ status, page: p }) {
      const { db, inScope, t } = await admin();
      const rows = db.certificates
        .filter((c) => inScope(workerById(db, c.workerId)!.site))
        .map((c) => certItem(db, c, t))
        .filter((c) => !status || c.status === status);
      return page(rows, p);
    },

    async revokeCertificate(id, reason) {
      const { db, inScope, t } = await admin();
      const c = db.certificates.find((x) => x.id === id);
      if (!c || !inScope(workerById(db, c.workerId)!.site)) throw notFound();
      if (!reason.trim() || reason.length > 500) throw new ApiError(422, "validation_error", "body.reason: must be 1-500 characters");
      if (c.revokedAt === null) {
        // Revoking twice is a no-op (D-023)
        c.revokedAt = t;
        c.revokedReason = reason;
        db.revocations = await signRevocations(db.certificates, t);
      }
      return certItem(db, c, t);
    },

    async recertDue(days) {
      const { db, inScope, t } = await admin();
      if (!Number.isInteger(days) || days < 0 || days > 365) throw new ApiError(422, "validation_error", "query.days: must be 0-365");
      return recertDue(db, inScope, t, days);
    },

    async devices(status) {
      const { db } = await admin(true);
      return db.devices.filter((d) => !status || d.status === status).map(device);
    },

    async approveDevice(id) {
      const { db, t } = await admin(true);
      const d = db.devices.find((x) => x.id === id);
      if (!d) throw notFound();
      if (d.status === "revoked") throw new ApiError(409, "conflict", "Device is revoked");
      if (d.status !== "approved") {
        d.status = "approved";
        d.approvedAt = t;
      }
      return device(d);
    },

    async exportAttemptsCsv({ from, to, site }) {
      const { db, inScope } = await admin();
      const cell = (v: unknown) => {
        let text = v === null || v === undefined ? "" : String(v);
        if (/^[=+\-@]/.test(text)) text = `'${text}`; // CSV injection (docs/06)
        return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
      };
      const header = "attempt_id,worker_id,worker_name,site,scenario_id,scenario_version,variant,mode,score_percent,passed,flagged,flag_reason,started_at";
      const rows = db.attempts
        .filter((a) => inScope(a.site) && (!site || a.site === site) && (from === undefined || a.startedAt >= from) && (to === undefined || a.startedAt <= to))
        .sort((a, b) => a.startedAt - b.startedAt)
        .map((a) =>
          [a.id, a.workerId, workerById(db, a.workerId)?.displayName, a.site, a.scenarioId, a.result.scenarioVersion, a.variant, a.mode, a.scorePercent, a.passed, a.flagged, a.flagReason, new Date(a.startedAt * 1000).toISOString().replace(".000Z", "Z")]
            .map(cell)
            .join(","),
        );
      return [header, ...rows].join("\r\n") + "\r\n";
    },

    async revocations() {
      await delay();
      return (await load()).revocations;
    },

    async publicVerify(token) {
      await delay();
      if (!token) throw new ApiError(422, "validation_error", "query.token: Field required");
      if (token.length > 4096) throw new ApiError(422, "validation_error", "query.token: String should have at most 4096 characters");
      const db = await load();
      const t = now();
      const r = await verifyCertificate(token, { rootPublicKey: publicKeyFromB64url(TEST_ROOT_PUBLIC_KEY), now: t, revocationList: db.revocations.token });
      if (!r.certificate) return { status: r.status, checkedAt: t };
      const c = r.certificate;
      return { status: r.status, workerName: c.wn, site: c.site, modules: c.mods.map((m) => ({ id: m.id, score: m.s })), issuedAt: c.iat, expiresAt: c.exp, checkedAt: t };
    },
  };
}
