/** Hand-written mirror of docs/06-API.md (admin shapes: D-025). Update both together. */
import type { VerifyStatus } from "../lib/cert";

export type CertStatus = "valid" | "expiring" | "expired" | "revoked";
export type WorkerCertStatus = CertStatus | "none";
export type DeviceStatus = "pending" | "approved" | "revoked";
export type Paged<T> = { items: T[]; total: number };

export const PAGE_SIZE = 25;

export interface FailedRule {
  ruleId: string;
  scenarioId: string;
  failures: number;
}

export interface Overview {
  workers: number;
  certifiedPercent: number;
  attempts7d: number;
  recertDue30d: number;
  topFailedRules: FailedRule[];
}

export interface Site {
  id: string;
  code: string;
  name: string;
  district: string;
  sector: string;
  workers: number;
  certifiedPercent: number;
}

export interface HeatmapCell {
  site: string;
  scenario: string;
  passRate: number | null; // 0-100; null when attempts is 0
  attempts: number;
}

export interface Heatmap {
  sites: string[];
  scenarios: string[];
  cells: HeatmapCell[];
}

export interface WorkerListItem {
  id: string;
  displayName: string;
  site: string;
  certStatus: WorkerCertStatus;
  lastAttemptAt: number | null;
}

export interface AttemptSummary {
  id: string;
  workerId: string;
  workerName: string;
  site: string;
  scenarioId: string;
  variant: string;
  mode: string; // "ar" | "tabletop"
  scorePercent: number;
  passed: boolean;
  flagged: boolean;
  startedAt: number;
}

/** docs/03 AttemptResult, as the device sent it. */
export interface RuleResult {
  ruleId: string;
  earned: number;
  max: number;
  critical: boolean;
  passed: boolean;
  feedbackKey?: string;
}

export interface AttemptResult {
  attemptId?: string;
  scenarioId?: string;
  scenarioVersion?: number;
  variant?: string;
  seed?: number;
  mode?: string;
  startedAt?: number;
  durationSec?: number;
  scorePercent?: number;
  passed?: boolean;
  criticalFailures?: string[];
  rules?: RuleResult[];
  eventsSha256?: string;
}

/** docs/03 event model. */
export interface AttemptEvent {
  t: number;
  type: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

export interface AttemptDetail extends AttemptSummary {
  durationSec: number;
  flagReason: string | null;
  result: AttemptResult;
  events: AttemptEvent[];
}

export interface WorkerCertificate {
  id: string;
  issuedAt: number;
  expiresAt: number;
  status: CertStatus;
  token: string;
}

export interface WorkerDetail {
  id: string;
  displayName: string;
  employeeCode: string | null;
  site: string;
  preferredLang: string;
  certStatus: WorkerCertStatus;
  createdAt: number;
  attempts: AttemptSummary[];
  certificates: WorkerCertificate[];
}

export interface CertificateItem {
  id: string;
  worker: { id: string; displayName: string; site: string };
  issuedAt: number;
  expiresAt: number;
  status: CertStatus;
  revokedAt: number | null;
  revokedReason: string | null;
}

export interface RecertDueItem {
  workerId: string;
  displayName: string;
  site: string;
  expiresAt: number;
  daysLeft: number;
}

export interface Device {
  id: string;
  label: string;
  site: string;
  status: DeviceStatus;
  lastSeenAt: number | null;
  approvedAt: number | null;
}

export interface Revocations {
  token: string; // SR1
  iat: number;
}

export interface PublicVerify {
  status: VerifyStatus;
  workerName?: string;
  site?: string;
  modules?: { id: string; score: number }[];
  issuedAt?: number;
  expiresAt?: number;
  checkedAt: number;
}

export interface WorkerQuery {
  site?: string;
  q?: string;
  page?: number;
}

export interface AttemptQuery {
  scenario?: string;
  passed?: boolean;
  flagged?: boolean;
  site?: string;
  page?: number;
}

export interface CertificateQuery {
  status?: CertStatus;
  page?: number;
}

export interface ExportQuery {
  from?: number;
  to?: number;
  site?: string;
}

/** Everything the dashboard asks of the backend. Implemented by http.ts and mock/. */
export interface ApiClient {
  overview(): Promise<Overview>;
  sites(): Promise<Site[]>;
  heatmap(): Promise<Heatmap>;
  workers(query: WorkerQuery): Promise<Paged<WorkerListItem>>;
  worker(id: string): Promise<WorkerDetail>;
  attempts(query: AttemptQuery): Promise<Paged<AttemptSummary>>;
  attempt(id: string): Promise<AttemptDetail>;
  certificates(query: CertificateQuery): Promise<Paged<CertificateItem>>;
  revokeCertificate(id: string, reason: string): Promise<CertificateItem>;
  recertDue(days: number): Promise<RecertDueItem[]>;
  devices(status?: DeviceStatus): Promise<Device[]>;
  approveDevice(id: string): Promise<Device>;
  exportAttemptsCsv(query: ExportQuery): Promise<string>;
  revocations(): Promise<Revocations>;
  publicVerify(token: string): Promise<PublicVerify>;
}

/** The docs/06 error envelope, or a network failure (status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
