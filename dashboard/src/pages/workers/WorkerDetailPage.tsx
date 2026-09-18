import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api, type WorkerCertificate } from "../../api";
import { formatDate, formatDateTime, modeName, scenarioName } from "../../components/format";
import { QrImage } from "../../components/QrImage";
import { Card, CertChip, EmptyState, FlagBadge, PageHeader, PassBadge, QueryView } from "../../components/ui";

const LANGUAGES: Record<string, string> = { hi: "Hindi", sat: "Santali", en: "English" };

export function WorkerDetailPage() {
  const { id = "" } = useParams();
  const worker = useQuery({ queryKey: ["worker", id], queryFn: () => api.worker(id) });

  return (
    <QueryView query={worker} skeletonRows={8}>
      {(w) => (
        <>
          <PageHeader
            title={w.displayName}
            subtitle={
              <span className="flex flex-wrap items-center gap-2">
                <CertChip status={w.certStatus} />
                <span>{w.site}</span>
              </span>
            }
            actions={
              <Link to="/workers" className="btn-secondary">
                ← All workers
              </Link>
            }
          />
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Profile">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Employee code</dt>
                <dd>{w.employeeCode ?? "—"}</dd>
                <dt className="text-slate-500">Site</dt>
                <dd>{w.site}</dd>
                <dt className="text-slate-500">Language</dt>
                <dd>{LANGUAGES[w.preferredLang] ?? w.preferredLang}</dd>
                <dt className="text-slate-500">Enrolled</dt>
                <dd>{formatDate(w.createdAt)}</dd>
                <dt className="text-slate-500">Attempts</dt>
                <dd>{w.attempts.length}</dd>
              </dl>
            </Card>

            <Card title="Attempts" className="lg:col-span-2">
              {w.attempts.length === 0 ? (
                <EmptyState message="No attempts yet. They appear after the worker trains on a kiosk and it syncs." />
              ) : (
                <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
                  {w.attempts.map((a) => (
                    <li key={a.id} className="relative">
                      <span className={`absolute top-1.5 -left-[27px] h-3 w-3 rounded-full ring-4 ring-white ${a.passed ? "bg-green-600" : "bg-fail"}`} />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Link to={`/attempts/${a.id}`} className="link font-medium">
                          {scenarioName(a.scenarioId)}
                        </Link>
                        <span className="text-slate-500">
                          {a.variant} · {modeName(a.mode)}
                        </span>
                        <span className="font-semibold tabular-nums">{a.scorePercent}%</span>
                        <PassBadge passed={a.passed} />
                        {a.flagged && <FlagBadge />}
                      </div>
                      <div className="text-xs text-slate-500">{formatDateTime(a.startedAt)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <Card title="Certificates" className="mt-6">
            {w.certificates.length === 0 ? (
              <EmptyState message="No certificate yet. The kiosk issues one once both modules are passed." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {w.certificates.map((c) => (
                  <CertificateCard key={c.id} cert={c} workerName={w.displayName} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </QueryView>
  );
}

function CertificateCard({ cert, workerName }: { cert: WorkerCertificate; workerName: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-slate-200 p-4">
      <QrImage value={cert.token} size={180} label={`Certificate QR for ${workerName}`} />
      <CertChip status={cert.status} />
      <div className="text-center text-xs text-slate-600">
        Issued {formatDate(cert.issuedAt)} · Expires {formatDate(cert.expiresAt)}
      </div>
      <div className="flex gap-2">
        <Link to={`/verify?token=${encodeURIComponent(cert.token)}`} className="btn-secondary">
          Verify
        </Link>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(cert.token).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy token"}
        </button>
      </div>
    </div>
  );
}
