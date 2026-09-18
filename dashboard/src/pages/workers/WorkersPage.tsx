import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, PAGE_SIZE } from "../../api";
import { formatDateTime } from "../../components/format";
import { CertChip, Card, EmptyState, PageHeader, Pager, QueryView, Table } from "../../components/ui";
import { useSearchState } from "../../components/useSearchState";

export function WorkersPage() {
  const { values, page, set } = useSearchState(["q", "site"] as const);
  const [search, setSearch] = useState(values.q);
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => api.sites() });
  const query = { q: values.q || undefined, site: values.site || undefined, page };
  const workers = useQuery({
    queryKey: ["workers", query],
    queryFn: () => api.workers(query),
    placeholderData: keepPreviousData,
  });

  // Search as you type, debounced
  useEffect(() => {
    if (search === values.q) return;
    const id = setTimeout(() => set({ q: search }), 300);
    return () => clearTimeout(id);
    // Deliberately keyed on typing only, not on every URL change
  }, [search]);

  const filtered = Boolean(values.q || values.site);

  return (
    <>
      <PageHeader title="Workers" subtitle="Everyone enrolled on a kiosk at your sites" />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="min-w-56 flex-1 text-sm">
            <span className="sr-only">Search</span>
            <input
              type="search"
              className="input"
              placeholder="Search by name or employee code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="sr-only">Site</span>
            <select className="input" value={values.site} onChange={(e) => set({ site: e.target.value })} aria-label="Site">
              <option value="">All sites</option>
              {sites.data?.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <QueryView query={workers} skeletonRows={10}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                message={filtered ? "No workers match these filters." : "No workers yet. Enrol workers on a kiosk, then sync it."}
                action={
                  filtered && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setSearch("");
                        set({ q: "", site: "" });
                      }}
                    >
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
                      <th className="th">Name</th>
                      <th className="th">Site</th>
                      <th className="th">Certificate</th>
                      <th className="th">Last attempt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50">
                        <td className="td">
                          <Link className="link font-medium" to={`/workers/${w.id}`}>
                            {w.displayName}
                          </Link>
                        </td>
                        <td className="td">{w.site}</td>
                        <td className="td">
                          <CertChip status={w.certStatus} />
                        </td>
                        <td className="td text-slate-600">{w.lastAttemptAt ? formatDateTime(w.lastAttemptAt) : "No attempts"}</td>
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
