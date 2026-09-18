import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api, type AttemptEvent, type RuleResult } from "../../api";
import { formatDateTime, modeName, scenarioName } from "../../components/format";
import { Card, EmptyState, FlagBadge, PageHeader, PassBadge, QueryView, Table } from "../../components/ui";

/** docs/03 result screen order: failed criticals first, then lost points, then full marks. */
export function sortRules(rules: RuleResult[]): RuleResult[] {
  const rank = (r: RuleResult) => (r.critical && !r.passed ? 0 : r.earned < r.max ? 1 : 2);
  return rules
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(({ r }) => r);
}

const EVENT_LABELS: Record<string, string> = {
  step_started: "Step started",
  step_completed: "Step completed",
  step_skipped: "Step skipped",
  choice_made: "Choice made",
  target_hit: "Target hit",
  hold_progress: "Hold progress",
  marker_found: "Marker found",
  position_reached: "Position reached",
  zone_marked: "Zone marked",
  forbidden_action: "Forbidden action",
  attempt_aborted: "Attempt aborted",
};

export function AttemptDetailPage() {
  const { id = "" } = useParams();
  const attempt = useQuery({ queryKey: ["attempt", id], queryFn: () => api.attempt(id) });

  return (
    <QueryView query={attempt} skeletonRows={10}>
      {(a) => {
        const rules = sortRules(a.result.rules ?? []);
        const events = [...a.events].sort((x, y) => x.t - y.t); // stable, like the engine (docs/03)
        return (
          <>
            <PageHeader
              title={`${scenarioName(a.scenarioId)} · ${a.scorePercent}%`}
              subtitle={
                <span className="flex flex-wrap items-center gap-2">
                  <PassBadge passed={a.passed} />
                  {a.flagged && <FlagBadge />}
                  <Link className="link" to={`/workers/${a.workerId}`}>
                    {a.workerName}
                  </Link>
                  <span>
                    · {a.site} · {a.variant} · {modeName(a.mode)} · {formatDateTime(a.startedAt)} · {Math.round(a.durationSec)} s
                  </span>
                </span>
              }
              actions={
                <Link to="/attempts" className="btn-secondary">
                  ← All attempts
                </Link>
              }
            />

            {a.flagged && (
              <div role="note" className="mb-6 rounded-md border border-safety/40 bg-orange-50 px-4 py-3 text-sm">
                <p className="font-semibold text-safety">Flagged: the device's result disagreed with the server's recomputation</p>
                <p className="mt-1 text-slate-700">{a.flagReason ?? "No reason recorded."}</p>
                <p className="mt-1 text-slate-600">
                  The device reported {a.result.scorePercent ?? "?"}% ({a.result.passed ? "pass" : "not yet"}). The dashboard shows the server's{" "}
                  {a.scorePercent}% ({a.passed ? "pass" : "not yet"}).
                </p>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-5">
              <Card title="Rule breakdown" className="xl:col-span-3">
                {rules.length === 0 ? (
                  <EmptyState message="This attempt has no rule results." />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <th className="th">Rule</th>
                        <th className="th text-right">Earned / max</th>
                        <th className="th">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((r) => (
                        <tr key={r.ruleId} className={r.critical && !r.passed ? "bg-red-50" : ""}>
                          <td className="td">
                            <span className="font-mono text-xs">{r.ruleId}</span>
                            {r.critical && (
                              <span className="ml-2 rounded bg-navy px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                                Critical
                              </span>
                            )}
                          </td>
                          <td className="td text-right tabular-nums">
                            {r.earned} / {r.max}
                          </td>
                          <td className="td">
                            {r.critical && !r.passed ? (
                              <span className="font-semibold text-fail">Critical failure</span>
                            ) : r.earned === r.max ? (
                              <span className="text-green-700">Full marks</span>
                            ) : (
                              <span className="text-amber-700">Lost {r.max - r.earned}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>

              <Card title="Event timeline" className="xl:col-span-2">
                {events.length === 0 ? (
                  <EmptyState message="No events were synced for this attempt." />
                ) : (
                  <ol className="max-h-[32rem] space-y-1 overflow-y-auto text-sm">
                    {events.map((e, i) => (
                      <EventRow key={i} event={e} />
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </>
        );
      }}
    </QueryView>
  );
}

function EventRow({ event }: { event: AttemptEvent }) {
  const bad = event.type === "forbidden_action" || event.type === "attempt_aborted";
  const data = event.data && Object.keys(event.data).length ? JSON.stringify(event.data) : null;
  return (
    <li className={`grid grid-cols-[4.5rem_1fr] gap-2 rounded px-2 py-1 ${bad ? "bg-red-50 text-fail" : ""}`}>
      <span className="font-mono text-xs text-slate-500 tabular-nums">{event.t.toFixed(2)} s</span>
      <span>
        {EVENT_LABELS[event.type] ?? event.type}
        {event.stepId && <span className="ml-1 font-mono text-xs text-slate-500">{event.stepId}</span>}
        {data && <span className="ml-1 font-mono text-xs text-slate-500">{data}</span>}
      </span>
    </li>
  );
}
