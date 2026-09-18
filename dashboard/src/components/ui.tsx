/** Shared building blocks: page header, card, the docs/08 loading/empty/error states, chips. */
import type { ReactNode } from "react";
import { ApiError, type CertStatus, type WorkerCertStatus } from "../api/types";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-4 text-base font-semibold text-navy">{title}</h2>}
      {children}
    </section>
  );
}

/** Loading: skeleton rows (docs/08). */
export function SkeletonRows({ rows = 6, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-slate-200/70" />
      ))}
    </div>
  );
}

/** Empty: one-line explanation + next action (docs/08). */
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">
      <p>{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Sign in again.";
    if (error.status === 403) return "You don't have access to this.";
    if (error.status === 404) return "Not found, or not at your sites.";
    return error.message;
  }
  return "Something went wrong.";
}

/** Error: message + retry (docs/08). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-fail/30 bg-red-50 px-4 py-4 text-sm text-fail">
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

/** Loading / error / data switch for a TanStack query. */
export function QueryView<T>({
  query,
  children,
  skeletonRows,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (data: T) => ReactNode;
  skeletonRows?: number;
}) {
  if (query.isPending) return <SkeletonRows rows={skeletonRows} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children(query.data as T)}</>;
}

const CHIP: Record<WorkerCertStatus, string> = {
  valid: "bg-green-100 text-green-800 ring-green-600/20",
  expiring: "bg-amber-100 text-amber-900 ring-amber-600/30",
  expired: "bg-slate-200 text-slate-700 ring-slate-500/20",
  revoked: "bg-red-100 text-fail ring-fail/30",
  none: "bg-white text-slate-500 ring-slate-300",
};
const CHIP_LABEL: Record<WorkerCertStatus, string> = {
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
  revoked: "Revoked",
  none: "Not certified",
};

export function CertChip({ status }: { status: CertStatus | WorkerCertStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CHIP[status]}`}>
      {CHIP_LABEL[status]}
    </span>
  );
}

export function PassBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Pass</span>
  ) : (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-fail">Not yet</span>
  );
}

export function FlagBadge() {
  return (
    <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-safety" title="Server score disagreed with the device">
      Flagged
    </span>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>
        {total === 0 ? "No rows" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </span>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className="btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}
