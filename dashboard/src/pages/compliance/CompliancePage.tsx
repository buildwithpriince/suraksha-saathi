import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, type HeatmapCell } from "../../api";
import { scenarioName } from "../../components/format";
import { Card, EmptyState, PageHeader, QueryView } from "../../components/ui";

/** 0% red -> 100% green (docs/08). Hue 0..120 at fixed saturation/lightness. */
export function passRateColor(passRate: number): string {
  const clamped = Math.min(100, Math.max(0, passRate));
  return `hsl(${Math.round(clamped * 1.2)} 70% 42%)`;
}

export function CompliancePage() {
  const heatmap = useQuery({ queryKey: ["heatmap"], queryFn: () => api.heatmap() });
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => api.sites() });
  const navigate = useNavigate();
  const siteName = (code: string) => sites.data?.find((s) => s.code === code)?.name;

  return (
    <>
      <PageHeader title="Compliance" subtitle="Pass rate by site and module. Click a cell to see its attempts." />
      <Card>
        <QueryView query={heatmap}>
          {(data) => {
            if (data.sites.length === 0) return <EmptyState message="No sites to show. Ask an admin to add your site." />;
            const cell = (site: string, scenario: string) => data.cells.find((c) => c.site === site && c.scenario === scenario);
            return (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-separate border-spacing-2 text-sm">
                    <thead>
                      <tr>
                        <th className="th border-none text-left">Site</th>
                        {data.scenarios.map((s) => (
                          <th key={s} className="th border-none text-center">
                            {scenarioName(s)}
                            <div className="font-normal normal-case text-slate-400">{s}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.sites.map((site) => (
                        <tr key={site}>
                          <th scope="row" className="pr-4 text-left font-medium">
                            {site}
                            {siteName(site) && <div className="text-xs font-normal text-slate-500">{siteName(site)}</div>}
                          </th>
                          {data.scenarios.map((scenario) => (
                            <td key={scenario} className="p-0">
                              <HeatCell
                                cell={cell(site, scenario) ?? { site, scenario, passRate: null, attempts: 0 }}
                                onOpen={() => navigate(`/attempts?site=${encodeURIComponent(site)}&scenario=${encodeURIComponent(scenario)}`)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Legend />
              </>
            );
          }}
        </QueryView>
      </Card>
    </>
  );
}

function HeatCell({ cell, onOpen }: { cell: HeatmapCell; onOpen: () => void }) {
  const label = `${cell.site} ${scenarioName(cell.scenario)}: ${cell.passRate === null ? "no attempts" : `${cell.passRate}% pass rate, ${cell.attempts} attempts`}`;
  if (cell.passRate === null) {
    return (
      <div aria-label={label} className="flex h-20 flex-col items-center justify-center rounded-md bg-slate-100 text-slate-500">
        <span className="text-sm">No attempts</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onOpen}
      style={{ backgroundColor: passRateColor(cell.passRate) }}
      className="flex h-20 w-full flex-col items-center justify-center rounded-md text-white shadow-sm transition hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
    >
      <span className="text-2xl font-semibold tabular-nums">{cell.passRate}%</span>
      <span className="text-xs opacity-90">
        {cell.attempts} attempt{cell.attempts === 1 ? "" : "s"}
      </span>
    </button>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex items-center gap-3 text-xs text-slate-600">
      <span>0%</span>
      <div
        className="h-2 w-48 rounded-full"
        style={{ background: `linear-gradient(to right, ${[0, 25, 50, 75, 100].map(passRateColor).join(", ")})` }}
      />
      <span>100% pass rate</span>
    </div>
  );
}
