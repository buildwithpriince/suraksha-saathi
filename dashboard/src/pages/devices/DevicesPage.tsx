import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type Device, type DeviceStatus } from "../../api";
import { formatDateTime, formatRelative } from "../../components/format";
import { Card, EmptyState, errorMessage, PageHeader, QueryView, Table } from "../../components/ui";
import { useSearchState } from "../../components/useSearchState";

const STATUS_STYLE: Record<DeviceStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-green-100 text-green-800",
  revoked: "bg-red-100 text-fail",
};

export function DevicesPage() {
  const { values, set } = useSearchState(["status"] as const);
  const status = (values.status || undefined) as DeviceStatus | undefined;
  const devices = useQuery({ queryKey: ["devices", status ?? "all"], queryFn: () => api.devices(status) });

  if (devices.error instanceof ApiError && devices.error.status === 403) {
    return (
      <>
        <PageHeader title="Devices" />
        <EmptyState message="Only admins can approve and manage kiosk devices. Ask an admin to approve a new kiosk." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Devices" subtitle="Kiosks can issue certificates only after an admin approves them (signed attestation, 365 days)." />
      <Card>
        <div role="group" aria-label="Status filter" className="mb-4 flex flex-wrap gap-2">
          {(["", "pending", "approved", "revoked"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={values.status === s}
              onClick={() => set({ status: s })}
              className={`rounded-full px-3 py-1 text-sm capitalize ${values.status === s ? "bg-navy text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
        <QueryView query={devices}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState message={status === "pending" ? "No devices are waiting for approval." : "No devices yet. A kiosk registers itself on first launch."} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th className="th">Label</th>
                    <th className="th">Site</th>
                    <th className="th">Status</th>
                    <th className="th">Last seen</th>
                    <th className="th">Approved</th>
                    <th className="th">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <DeviceRow key={d.id} device={d} />
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

function DeviceRow({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const approve = useMutation({
    mutationFn: () => api.approveDevice(device.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["devices"] }),
  });
  return (
    <tr className="hover:bg-slate-50">
      <td className="td font-medium">
        {device.label}
        <div className="font-mono text-xs font-normal text-slate-400">{device.id}</div>
      </td>
      <td className="td">{device.site}</td>
      <td className="td">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[device.status]}`}>{device.status}</span>
      </td>
      <td className="td text-slate-600" title={formatDateTime(device.lastSeenAt)}>
        {device.lastSeenAt ? formatRelative(device.lastSeenAt) : "Never"}
      </td>
      <td className="td text-slate-600">{formatDateTime(device.approvedAt)}</td>
      <td className="td text-right">
        {device.status === "pending" && (
          <button type="button" className="btn-primary" disabled={approve.isPending} onClick={() => approve.mutate()} aria-label={`Approve ${device.label}`}>
            {approve.isPending ? "Approving…" : "Approve"}
          </button>
        )}
        {approve.isError && (
          <div role="alert" className="mt-1 text-xs text-fail">
            {errorMessage(approve.error)}
          </div>
        )}
      </td>
    </tr>
  );
}

