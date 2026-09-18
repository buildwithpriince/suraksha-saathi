/**
 * Deterministic demo dataset shaped like docs/08 "Demo data" (what backend seed_demo.py creates):
 * 3 sites, 40 workers, ~150 attempts (GAS_01 R_BUDDY_CHECK fails most), 12 certificates expiring
 * within 30 days, 1 revoked, 1 pending device, 2 flagged attempts. Tokens are really signed, with the
 * docs/04 TEST keys, so /verify works on them in mock mode. Never used when a backend is configured.
 */
import fire from "../../../../content/scenarios/FIRE_01.json";
import gas from "../../../../content/scenarios/GAS_01.json";
import vectors from "../../../../content/trust/test-vectors.json";
import { hexToBytes, signToken } from "../../lib/cert";
import type { AttemptEvent, AttemptResult, DeviceStatus, RuleResult } from "../types";

export const DAY = 86400;
export const TEST_ROOT_SEED = hexToBytes(vectors.root_seed_hex);
export const TEST_ROOT_PUBLIC_KEY = vectors.root_public_key;
const DEVICE_SEED = hexToBytes(vectors.device_seed_hex);

interface ScenarioFile {
  id: string;
  version: number;
  passThresholdPercent: number;
  validityDays: number;
  variants: { id: string }[];
  steps: { id: string; variants?: string[] }[];
  rules: {
    id: string;
    points: number;
    critical: boolean;
    criticalOn?: string;
    variants?: string[];
    feedbackKey?: string;
    params: { step?: string; before?: string; after?: string };
  }[];
}

export const SCENARIOS = [fire, gas] as unknown as ScenarioFile[];

export interface MockSite {
  id: string;
  code: string;
  name: string;
  district: string;
  sector: string;
}

export interface MockWorker {
  id: string;
  displayName: string;
  employeeCode: string | null;
  site: string;
  preferredLang: string;
  createdAt: number;
}

export interface MockAttempt {
  id: string;
  workerId: string;
  site: string;
  scenarioId: string;
  variant: string;
  mode: string;
  scorePercent: number; // server-recomputed (D-022)
  passed: boolean;
  flagged: boolean;
  flagReason: string | null;
  startedAt: number;
  durationSec: number;
  result: AttemptResult;
  events: AttemptEvent[];
}

export interface MockCertificate {
  id: string;
  workerId: string;
  issuedAt: number;
  expiresAt: number;
  revokedAt: number | null;
  revokedReason: string | null;
  token: string;
}

export interface MockDevice {
  id: string;
  label: string;
  site: string;
  status: DeviceStatus;
  lastSeenAt: number | null;
  approvedAt: number | null;
  registeredAt: number;
}

export interface MockDb {
  now: number;
  sites: MockSite[];
  workers: MockWorker[];
  attempts: MockAttempt[];
  certificates: MockCertificate[];
  devices: MockDevice[];
  revocations: { token: string; iat: number };
}

const SITES: [string, string, string, string][] = [
  ["DHN-01", "Dhanbad Colliery", "Dhanbad", "coal"],
  ["JSR-02", "Jamshedpur Steel Works", "East Singhbhum", "steel"],
  ["KDM-03", "Koderma Mica Unit", "Koderma", "mica"],
];
const FIRST = ["Ravi", "Sunita", "Anil", "Pooja", "Birsa", "Salomi", "Manoj", "Rekha", "Sanjay", "Kavita", "Mangal", "Sukhram", "Phulmani", "Deepak", "Geeta", "Budhan", "Sita", "Ramesh", "Anita", "Bishu"];
const LAST = ["Munda", "Oraon", "Hembrom", "Soren", "Tudu", "Marandi", "Kisku", "Mahato", "Besra", "Murmu", "Hansda", "Toppo", "Lakra", "Ekka"];
const LANGS = ["hi", "hi", "hi", "hi", "hi", "sat", "sat", "sat", "en", "en"];

// Same rates as seed_demo.py: R_BUDDY_CHECK is the most-failed rule (docs/08)
const FAIL_RATE: Record<string, number> = {
  R_ALARM_BEFORE_FIGHT: 0.06, R_ALARM_FAST: 0.2, R_EXIT_FOUND: 0.1, R_RIGHT_EXTINGUISHER: 0.04,
  R_EXIT_BEHIND: 0.22, R_AIM_BASE: 0.25, R_EVACUATE_DECISION: 0.05, R_EVACUATE_TIME: 0.18,
  R_ASSEMBLY_REPORT: 0.12, R_PPE: 0.04, R_BUDDY_CHECK: 0.5, R_ZONE_ACCURACY: 0.25,
  R_NO_IGNITION: 0.05, R_SELF_RESCUER: 0.08, R_ORDER_RESCUER_RETREAT: 0.15,
  R_RETREAT_DECISION: 0.05, R_RETREAT_TIME: 0.18, R_REPORT: 0.12,
};
const HALF_POINT_RULES = new Set(["R_AIM_BASE", "R_ZONE_ACCURACY"]);

/** mulberry32: small deterministic PRNG so the demo looks the same on every load. */
function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}

function uuid(rand: () => number): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16));
  hex[12] = "4";
  hex[16] = "89ab"[Math.floor(rand() * 4)]!;
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** docs/03 round: half away from zero (D-022). */
export function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

export function scoreRules(scenario: ScenarioFile, rules: RuleResult[]) {
  const earned = rules.reduce((s, r) => s + r.earned, 0);
  const max = rules.reduce((s, r) => s + r.max, 0);
  const scorePercent = max ? roundHalfAway((100 * earned) / max) : 0;
  const criticalFailures = rules.filter((r) => r.critical && !r.passed).map((r) => r.ruleId);
  const passed = criticalFailures.length === 0 && scorePercent >= scenario.passThresholdPercent;
  return { scorePercent, passed, criticalFailures };
}

type Rand = ReturnType<typeof prng>;

function playRules(scenario: ScenarioFile, variant: string, skill: number, rand: Rand, mustPass: boolean): RuleResult[] {
  for (;;) {
    const rules = scenario.rules
      .filter((r) => !r.variants || r.variants.includes(variant))
      .map((r): RuleResult => {
        const failRate = (FAIL_RATE[r.id] ?? 0.1) * skill;
        let earned = r.points;
        if (rand.next() < failRate) {
          earned = HALF_POINT_RULES.has(r.id) && rand.next() < 0.5 ? Math.floor(r.points / 2) : 0;
        }
        // A critical rule fails when it earns 0, unless it is criticalOn "forbidden" (D-017):
        // the mock never plays forbidden picks there, so losing its points is not critical
        const passed = r.critical ? earned > 0 || r.criticalOn === "forbidden" : earned === r.points;
        return { ruleId: r.id, earned, max: r.points, critical: r.critical, passed, ...(r.feedbackKey ? { feedbackKey: r.feedbackKey } : {}) };
      });
    if (!mustPass || scoreRules(scenario, rules).passed) return rules;
  }
}

function playEvents(scenario: ScenarioFile, variant: string, rules: RuleResult[], durationSec: number): AttemptEvent[] {
  const steps = scenario.steps.filter((s) => !s.variants || s.variants.includes(variant));
  const slot = durationSec / steps.length;
  const events: AttemptEvent[] = [];
  steps.forEach((step, i) => {
    const t0 = Math.round(i * slot * 100) / 100;
    events.push({ t: t0, type: "step_started", stepId: step.id });
    const failed = rules.find((r) => !r.passed && scenario.rules.find((s) => s.id === r.ruleId)?.params.step === step.id);
    if (failed?.ruleId === "R_NO_IGNITION") {
      events.push({ t: Math.round((t0 + slot / 2) * 100) / 100, type: "forbidden_action", stepId: step.id, data: { tag: "ignition" } });
    }
    events.push({ t: Math.round((t0 + slot * 0.9) * 100) / 100, type: "step_completed", stepId: step.id });
  });
  return events;
}

export async function signCertificate(
  cid: string,
  worker: MockWorker,
  mods: { id: string; v: number; s: number }[],
  iat: number,
  exp: number,
  attestation: string,
): Promise<string> {
  const body = { cid, wid: worker.id, wn: worker.displayName.slice(0, 24), site: worker.site, mods, iat, exp, lang: worker.preferredLang, att: attestation };
  return signToken("SS1", body, DEVICE_SEED);
}

export async function signRevocations(certificates: MockCertificate[], iat: number) {
  const cids = certificates.filter((c) => c.revokedAt !== null).map((c) => c.id.toLowerCase()).sort();
  return { token: await signToken("SR1", { iat, cids }, TEST_ROOT_SEED), iat };
}

export async function buildMockDb(now = Math.floor(Date.now() / 1000), seed = 2026): Promise<MockDb> {
  const rand = prng(seed);
  const id = () => uuid(rand.next);

  const sites: MockSite[] = SITES.map(([code, name, district, sector]) => ({ id: id(), code, name, district, sector }));

  // One approved kiosk per site (attestations signed by the TEST root key), plus one pending device
  const devices: MockDevice[] = [];
  const attestations = new Map<string, string>();
  for (const [i, site] of sites.entries()) {
    const device: MockDevice = {
      id: id(), label: `Kiosk tablet 1 (${site.code})`, site: site.code, status: "approved",
      lastSeenAt: now - rand.int(1, 48) * 3600, approvedAt: now - 700 * DAY + i * DAY, registeredAt: now - 701 * DAY + i * DAY,
    };
    devices.push(device);
    attestations.set(site.code, await signToken("SA1", { did: device.id, dpk: vectors.device_public_key, site: site.code, iat: device.approvedAt!, exp: device.approvedAt! + 1095 * DAY }, TEST_ROOT_SEED));
  }
  devices.push({ id: id(), label: "Kiosk tablet 2 (new, awaiting approval)", site: "DHN-01", status: "pending", lastSeenAt: now - 2 * 3600, approvedAt: null, registeredAt: now - DAY });
  devices.sort((a, b) => b.registeredAt - a.registeredAt);

  const workers: MockWorker[] = [];
  const names = new Set<string>();
  for (let i = 0; i < 40; i++) {
    let name = "";
    do name = `${rand.pick(FIRST)} ${rand.pick(LAST)}`;
    while (names.has(name));
    names.add(name);
    const site = sites[i % 3]!.code;
    workers.push({
      id: id(), displayName: name, employeeCode: rand.next() < 0.8 ? `${site.slice(0, 3)}-${String(1000 + i * 7)}` : null,
      site, preferredLang: rand.pick(LANGS), createdAt: now - rand.int(200, 420) * DAY,
    });
  }

  const attempts: MockAttempt[] = [];
  const addAttempt = (worker: MockWorker, scenario: ScenarioFile, startedAt: number, skill: number, mustPass: boolean) => {
    const variant = rand.pick(scenario.variants).id;
    const mode = rand.next() < 0.8 ? "ar" : "tabletop";
    const rules = playRules(scenario, variant, skill, rand, mustPass);
    const { scorePercent, passed, criticalFailures } = scoreRules(scenario, rules);
    const durationSec = Math.round((150 + rand.next() * 150) * 10) / 10;
    const attemptId = id();
    attempts.push({
      id: attemptId, workerId: worker.id, site: worker.site, scenarioId: scenario.id, variant, mode, scorePercent, passed,
      flagged: false, flagReason: null, startedAt, durationSec,
      result: { attemptId, scenarioId: scenario.id, scenarioVersion: scenario.version, variant, seed: rand.int(1, 999999), mode, startedAt, durationSec, scorePercent, passed, criticalFailures, rules, eventsSha256: "" },
      events: playEvents(scenario, variant, rules, durationSec),
    });
    return attempts[attempts.length - 1]!;
  };

  // Certificates: 12 expiring within 30 days, 2 expired, 1 revoked, the rest valid; 12 workers have none
  const certificates: MockCertificate[] = [];
  const validity = Math.min(...SCENARIOS.map((s) => s.validityDays)) * DAY;
  for (const [i, worker] of workers.entries()) {
    const skill = 0.5 + rand.next(); // < 1 is better than average
    let issuedAt: number | null = null;
    if (i < 12) issuedAt = now - validity + rand.int(1, 29) * DAY + rand.int(0, 20) * 3600;
    else if (i < 14) issuedAt = now - validity - rand.int(5, 60) * DAY;
    else if (i < 28) issuedAt = now - rand.int(3, 200) * DAY;

    // Practice attempts before the certificate (or recent ones for uncertified workers)
    const practiceEnd = issuedAt ?? now;
    const practice = rand.int(1, 4);
    for (let k = 0; k < practice; k++) {
      const start = issuedAt === null ? now - rand.int(0, 90) * DAY - rand.int(0, 86000) : practiceEnd - rand.int(2, 40) * DAY;
      addAttempt(worker, rand.pick(SCENARIOS), start, skill * 1.4, false);
    }
    if (issuedAt === null) continue;
    const mods = SCENARIOS.map((s) => {
      const a = addAttempt(worker, s, issuedAt! - rand.int(600, 7200), skill * 0.6, true);
      return { id: s.id, v: s.version, s: a.scorePercent };
    });
    const cid = id();
    certificates.push({
      id: cid, workerId: worker.id, issuedAt, expiresAt: issuedAt + validity, revokedAt: null, revokedReason: null,
      token: await signCertificate(cid, worker, mods, issuedAt, issuedAt + validity, attestations.get(worker.site)!),
    });
    // Refreshers after certification keep the last-7-days numbers realistic
    if (rand.next() < 0.4) addAttempt(worker, rand.pick(SCENARIOS), now - rand.int(0, 12) * DAY - rand.int(0, 80000), skill, false);
  }
  const revoked = certificates[20]!;
  revoked.revokedAt = now - 9 * DAY;
  revoked.revokedReason = "Issued on a kiosk reported stolen; worker to re-certify";

  // 2 flagged attempts: the device claimed a pass that the server's recomputation rejected (D-022)
  const failing = attempts.filter((a) => !a.passed).slice(0, 2);
  for (const a of failing) {
    a.flagged = true;
    a.flagReason = `scorePercent ${Math.max(a.scorePercent, 72)}, server computed ${a.scorePercent}; passed true, server computed false`;
    a.result = { ...a.result, scorePercent: Math.max(a.scorePercent, 72), passed: true, criticalFailures: [] };
  }

  attempts.sort((a, b) => b.startedAt - a.startedAt);
  certificates.sort((a, b) => b.issuedAt - a.issuedAt);
  return { now, sites, workers, attempts, certificates, devices, revocations: await signRevocations(certificates, revoked.revokedAt) };
}
