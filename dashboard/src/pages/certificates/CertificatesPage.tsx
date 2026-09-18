import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, PAGE_SIZE, type CertStatus, type CertificateItem } from "../../api";
import { formatDate } from "../../components/format";
import { Modal } from "../../components/Modal";
import { Card, CertChip, EmptyState, errorMessage, PageHeader, Pager, QueryView, Table } from "../../components/ui";
import { useSearchState } from "../../components/useSearchState";

const STATUSES: { value: "" | CertStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "valid", label: "Valid" },
  { value: "expiring", label: "Expiring" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

export function CertificatesPage() {
  const { values, page, set } = useSearchState(["status"] as const);
  const status = (values.status || undefined) as CertStatus | undefined;
  const query = { status, page };
  const certificates = useQuery({
    queryKey: ["certificates", query],
    queryFn: () => api.certificates(query),
    placeholderData: keepPreviousData,
  });
  const [revoking, setRevoking] = useState<CertificateItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Certificates" subtitle="Issued on kiosks and synced. Revoking one adds it to the signed revocation list." />
      <Card>
        <div role="group" aria-label="Status filter" className="mb-4 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={values.status === s.value}
              onClick={() => set({ status: s.value })}
              className={`rounded-full px-3 py-1 text-sm ${values.status === s.value ? "bg-navy text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {notice && (
          <p role="status" className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            {notice}
          </p>
        )}
        <QueryView query={certificates} skeletonRows={10}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                message={status ? `No ${status} certificates.` : "No certificates yet. Kiosks issue them when a worker passes both modules."}
                action={status && <button type="button" className="btn-secondary" onClick={() => set({ status: "" })}>Show all</button>}
              />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <th className="th">Worker</th>
                      <th className="th">Site</th>
                      <th className="th">Issued</th>
                      <th className="th">Expires</th>
                      <th className="th">Status</th>
                      <th className="th">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="td">
                          <Link className="link font-medium" to={`/workers/${c.worker.id}`}>
                            {c.worker.displayName}
                          </Link>
                        </td>
                        <td className="td">{c.worker.site}</td>
                        <td className="td">{formatDate(c.issuedAt)}</td>
                        <td className="td">{formatDate(c.expiresAt)}</td>
                        <td className="td">
                          <CertChip status={c.status} />
                          {c.status === "revoked" && c.revokedReason && (
                            <div className="mt-1 max-w-xs text-xs text-slate-500" title={c.revokedReason}>
                              {formatDate(c.revokedAt)}: {c.revokedReason}
                            </div>
                          )}
                        </td>
                        <td className="td text-right">
                          {c.status !== "revoked" && (
                            <button type="button" className="btn-secondary text-fail" onClick={() => setRevoking(c)} aria-label={`Revoke certificate of ${c.worker.displayName}`}>
                              Revoke
                            </button>
                          )}
                        </td>
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
      {revoking && (
        <RevokeDialog
          cert={revoking}
          onClose={() => setRevoking(null)}
          onDone={(c) => {
            setRevoking(null);
            setNotice(`Revoked ${c.worker.displayName}'s certificate. Devices pick up the new revocation list at their next sync.`);
          }}
        />
      )}
    </>
  );
}

function RevokeDialog({ cert, onClose, onDone }: { cert: CertificateItem; onClose: () => void; onDone: (c: CertificateItem) => void }) {
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => api.revokeCertificate(cert.id, reason.trim()),
    onSuccess: async (c) => {
      // status, counts, worker chips and the SR1 list all change
      await queryClient.invalidateQueries();
      onDone(c);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!confirming) setConfirming(true);
    else revoke.mutate();
  }

  return (
    <Modal title="Revoke certificate" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <p className="text-slate-700">
          <strong>{cert.worker.displayName}</strong> ({cert.worker.site}), issued {formatDate(cert.issuedAt)}. A revoked certificate shows
          as <strong className="text-fail">Revoked</strong> everywhere it is verified. This can't be undone.
        </p>
        <label className="block font-medium text-slate-700">
          Reason
          <textarea
            required
            maxLength={500}
            rows={3}
            className="input mt-1"
            value={reason}
            disabled={confirming}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Issued on a kiosk reported stolen"
          />
        </label>
        {confirming && !revoke.isError && <p className="font-medium text-fail">Revoke this certificate? Press "Confirm revoke" to continue.</p>}
        {revoke.isError && (
          <p role="alert" className="text-fail">
            {errorMessage(revoke.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-danger" disabled={!reason.trim() || revoke.isPending}>
            {revoke.isPending ? "Revoking…" : confirming ? "Confirm revoke" : "Revoke"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
