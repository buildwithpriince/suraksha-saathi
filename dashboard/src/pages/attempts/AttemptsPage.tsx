import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { api, PAGE_SIZE } from "../../api";
import { formatDateTime, modeName, SCENARIO_NAMES, scenarioName } from "../../components/format";
import { Card, EmptyState, FlagBadge, PageHeader, Pager, PassBadge, QueryView, Table } from "../../components/ui";
import { parseBool, useSearchState } from "../../components/useSearchState";

export function AttemptsPage() {
  const { values, page, set } = useSearchState(["scenario", "passed", "flagged", "site"] as const);
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => api.sites() });
  const query = {
    scenario: values.scenario || undefined,
    passed: parseBool(values.passed),
    flagged: parseBool(values.flagged),
    site: values.site || undefined,
    page,
  };
  const attempts = useQuery({
    queryKey: ["attempts", query],
    queryFn: () => api.attempts(query),
    placeholderData: keepPreviousData,
  });
  const filtered = Boolean(values.scenario || values.passed || values.flagged || values.site);

  return (
    <>
      <PageHeader title="Attempts" subtitle="Every synced training run, newest first. Scores are the server's recomputed values." />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Filter label="Module" value={values.scenario} onChange={(v) => set({ scenario: v })}>
            <option value="">All modules</option>
            {Object.entries(SCENARIO_NAMES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Filter>
          <Filter label="Result" value={values.passed} onChange={(v) => set({ passed: v })}>
            <option value="">Pass and not yet</option>
            <option value="true">Passed</option>
            <option value="false">Not yet</option>
          </Filter>
          <Filter label="Flagged" value={values.flagged} onChange={(v) => set({ flagged: v })}>
            <option value="">Flagged or not</option>
            <option value="true">Flagged only</option>
            <option value="false">Not flagged</option>
          </Filter>
          <Filter label="Site" value={values.site} onChange={(v) => set({ site: v })}>
            <option value="">All sites</option>
            {sites.data?.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} · {s.name}
              </option>
            ))}
          </Filter>
        </div>
        <QueryView query={attempts} skeletonRows={10}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                message={filtered ? "No attempts match these filters." : "No attempts yet. They appear after a kiosk syncs."}
                action={
                  filtered && (
                    <button type="button" className="btn-secondary" onClick={() => set({ scenario: "", passed: "", flagged: "", site: "" })}>
                      Clear filters
                    </button>
                  )
                }
              />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <th className="th">Worker</th>
                      <th className="th">Module</th>
                      <th className="th">Variant</th>
                      <th className="th">Mode</th>
                      <th className="th text-right">Score</th>
                      <th className="th">Pass</th>
                      <th className="th">Flagged</th>
                      <th className="th">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="td">
                          <Link className="link font-medium" to={`/workers/${a.workerId}`}>
                            {a.workerName}
                          </Link>
                          <div className="text-xs text-slate-500">{a.site}</div>
                        </td>
                        <td className="td">
                          <Link className="link" to={`/attempts/${a.id}`}>
                            {scenarioName(a.scenarioId)}
                          </Link>
                        </td>
                        <td className="td">{a.variant}</td>
                        <td className="td">{modeName(a.mode)}</td>
                        <td className="td text-right font-semibold tabular-nums">{a.scorePercent}%</td>
                        <td className="td">
                          <PassBadge passed={a.passed} />
                        </td>
                        <td className="td">{a.flagged ? <FlagBadge /> : <span className="text-slate-400">—</span>}</td>
                        <td className="td whitespace-nowrap text-slate-600">{formatDateTime(a.startedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Pager page={page} total={data.total} pageSize={PAGE_SIZE} onPage={(p) => set({ page: p })} />
              </>
            )
          }
        </QueryView>
      </Card>
    </>
  );
}

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <select className="input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
