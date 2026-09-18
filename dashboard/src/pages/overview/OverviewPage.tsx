import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type FailedRule } from "../../api";
import { formatDateTime, modeName, scenarioName } from "../../components/format";
import { Card, EmptyState, FlagBadge, PageHeader, PassBadge, QueryView, SkeletonRows, Table } from "../../components/ui";

export function OverviewPage() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api.overview() });
  const latest = useQuery({ queryKey: ["attempts", { page: 1 }], queryFn: () => api.attempts({ page: 1 }) });

  return (
    <>
      <PageHeader title="Overview" subtitle="Training and certification across your sites" />
      {overview.isPending ? (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-200/70" />
          ))}
        </div>
      ) : overview.isError ? null : (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Workers" value={overview.data.workers} to="/workers" />
          <Kpi label="Certified" value={`${overview.data.certifiedPercent}%`} to="/certificates" />
          <Kpi label="Attempts (7 days)" value={overview.data.attempts7d} to="/attempts" />
          <Kpi label="Recert due (30 days)" value={overview.data.recertDue30d} to="/recertification" accent={overview.data.recertDue30d > 0} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Top 5 failed rules" className="xl:col-span-2">
          <QueryView query={overview} skeletonRows={5}>
            {(data) =>
              data.topFailedRules.length === 0 ? (
                <EmptyState message="No failed rules yet. They appear here once devices sync attempts." />
              ) : (
                <FailedRulesChart rules={data.topFailedRules} />
              )
            }
          </QueryView>
        </Card>

        <Card title="Latest attempts" className="xl:col-span-3">
          {latest.isPending ? (
            <SkeletonRows rows={10} />
          ) : (
            <QueryView query={latest}>
              {(data) =>
                data.items.length === 0 ? (
                  <EmptyState message="No attempts yet. Train a worker on a kiosk, then sync it." />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <th className="th">Worker</th>
                        <th className="th">Module</th>
                        <th className="th">Mode</th>
                        <th className="th text-right">Score</th>
                        <th className="th">Result</th>
                        <th className="th">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.slice(0, 10).map((a) => (
                        <tr key={a.id}>
                          <td className="td">
                            <Link className="link" to={`/workers/${a.workerId}`}>
                              {a.workerName}
                            </Link>
                            <div className="text-xs text-slate-500">{a.site}</div>
                          </td>
                          <td className="td">{scenarioName(a.scenarioId)}</td>
                          <td className="td">{modeName(a.mode)}</td>
                          <td className="td text-right tabular-nums">
                            <Link className="link" to={`/attempts/${a.id}`}>
                              {a.scorePercent}%
                            </Link>
                          </td>
                          <td className="td">
                            <span className="flex gap-1">
                              <PassBadge passed={a.passed} />
                              {a.flagged && <FlagBadge />}
                            </span>
                          </td>
                          <td className="td whitespace-nowrap text-slate-600">{formatDateTime(a.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )
              }
            </QueryView>
          )}
          <div className="mt-3 text-right text-sm">
            <Link className="link" to="/attempts">
              All attempts →
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, to, accent = false }: { label: string; value: number | string; to: string; accent?: boolean }) {
  return (
    <Link to={to} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand">
      <div className="text-sm text-slate-600">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${accent ? "text-safety" : "text-navy"}`}>{value}</div>
    </Link>
  );
}

function FailedRulesChart({ rules }: { rules: FailedRule[] }) {
  const data = rules.map((r) => ({ ...r, label: r.ruleId.replace(/^R_/, "") }));
  return (
    <>
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value) => [value, "Failures"]}
              labelFormatter={(_label, payload) => {
                const row = payload?.[0]?.payload as FailedRule | undefined;
                return row ? `${row.ruleId} · ${scenarioName(row.scenarioId)}` : "";
              }}
            />
            <Bar dataKey="failures" fill="#B01E1E" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Top failed rules</caption>
        <tbody>
          {rules.map((r) => (
            <tr key={`${r.scenarioId}/${r.ruleId}`}>
              <td>{r.ruleId}</td>
              <td>{scenarioName(r.scenarioId)}</td>
              <td>{r.failures}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
