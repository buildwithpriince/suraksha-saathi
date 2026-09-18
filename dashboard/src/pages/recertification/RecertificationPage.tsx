import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api, type RecertDueItem } from "../../api";
import { csvCell, downloadText, formatDate } from "../../components/format";
import { Card, EmptyState, PageHeader, QueryView, Table } from "../../components/ui";
import { useSearchState } from "../../components/useSearchState";

const DEFAULT_DAYS = 30;

export function recertCsv(rows: RecertDueItem[]): string {
  const header = "worker_id,worker_name,site,expires_at,days_left";
  const lines = rows.map((r) =>
    [r.workerId, r.displayName, r.site, new Date(r.expiresAt * 1000).toISOString().replace(".000Z", "Z"), r.daysLeft].map(csvCell).join(","),
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}

export function RecertificationPage() {
  const { values, set } = useSearchState(["days"] as const);
  const parsed = Number(values.days);
  const days = values.days !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 365 ? parsed : DEFAULT_DAYS;
  const [draft, setDraft] = useState(String(days));
  const [ascending, setAscending] = useState(true);
  const due = useQuery({ queryKey: ["recert-due", days], queryFn: () => api.recertDue(days) });

  const sorted = (rows: RecertDueItem[]) =>
    [...rows].sort((a, b) => (ascending ? a.daysLeft - b.daysLeft : b.daysLeft - a.daysLeft) || a.displayName.localeCompare(b.displayName));

  return (
    <>
      <PageHeader
        title="Recertification"
        subtitle={`Workers whose current certificate expires within ${days} day${days === 1 ? "" : "s"}`}
        actions={
          <button
            type="button"
            className="btn-primary"
            disabled={!due.data?.length}
            onClick={() => due.data && downloadText(`recertification-due-${days}d.csv`, recertCsv(sorted(due.data)))}
          >
            Export CSV
          </button>
        }
      />
      <Card>
        <form
          className="mb-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(draft);
            if (Number.isInteger(n) && n >= 0 && n <= 365) set({ days: n === DEFAULT_DAYS ? "" : n });
          }}
        >
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Expires within (days)</span>
            <input type="number" min={0} max={365} className="input w-32" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Expires within (days)" />
          </label>
          <button type="submit" className="btn-secondary">
            Apply
          </button>
        </form>
        <QueryView query={due} skeletonRows={8}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState message={`No certificates expire in the next ${days} days. Try a longer window.`} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th className="th">Worker</th>
                    <th className="th">Site</th>
                    <th className="th">Expires</th>
                    <th className="th" aria-sort={ascending ? "ascending" : "descending"}>
                      <button type="button" className="uppercase" onClick={() => setAscending((a) => !a)}>
                        Days left {ascending ? "▲" : "▼"}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted(rows).map((r) => (
                    <tr key={r.workerId} className="hover:bg-slate-50">
                      <td className="td">
                        <Link className="link font-medium" to={`/workers/${r.workerId}`}>
                          {r.displayName}
                        </Link>
                      </td>
                      <td className="td">{r.site}</td>
                      <td className="td">{formatDate(r.expiresAt)}</td>
                      <td className={`td font-semibold tabular-nums ${r.daysLeft <= 7 ? "text-fail" : "text-amber-700"}`}>{r.daysLeft}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )
          }
        </QueryView>
      </Card>
    </>
  );
}
