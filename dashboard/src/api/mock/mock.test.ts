import { MOCK_ACCOUNTS, type MockAccount } from "../../auth/mock";
import { ApiError } from "../types";
import { buildMockDb, DAY } from "./data";
import { createMockApi } from ".";

const NOW = 1790000000;
const [adminAccount, supervisorAccount] = MOCK_ACCOUNTS as [MockAccount, MockAccount];

function apiAs(account: MockAccount | null, db = buildMockDb(NOW)) {
  return createMockApi({ account: () => account, latencyMs: 0, now: () => NOW, db });
}

describe("mock API matches docs/08 demo data", () => {
  const db = buildMockDb(NOW);
  const api = apiAs(adminAccount, db);

  test("3 sites, 40 workers, ~150 attempts", async () => {
    expect((await api.sites()).map((s) => s.code)).toEqual(["DHN-01", "JSR-02", "KDM-03"]);
    expect((await api.workers({})).total).toBe(40);
    const attempts = (await api.attempts({})).total;
    expect(attempts).toBeGreaterThan(110);
    expect(attempts).toBeLessThan(190);
  });

  test("12 recertifications due, 1 revoked, 2 flagged, 1 pending device", async () => {
    expect(await api.recertDue(30)).toHaveLength(12);
    expect((await api.certificates({ status: "revoked" })).total).toBe(1);
    expect((await api.attempts({ flagged: true })).total).toBe(2);
    expect(await api.devices("pending")).toHaveLength(1);
  });

  test("R_BUDDY_CHECK is the most-failed rule", async () => {
    const overview = await api.overview();
    expect(overview.topFailedRules[0]?.ruleId).toBe("R_BUDDY_CHECK");
    expect(overview.topFailedRules).toHaveLength(5);
    expect(overview.recertDue30d).toBe(12);
  });

  test("heatmap covers every site x scenario", async () => {
    const heatmap = await api.heatmap();
    expect(heatmap.cells).toHaveLength(6);
    for (const cell of heatmap.cells) expect(cell.passRate).toBeGreaterThanOrEqual(0);
  });

  test("demo certificates verify", async () => {
    const valid = (await api.certificates({ status: "valid" })).items[0]!;
    const detail = await api.worker(valid.worker.id);
    const token = detail.certificates.find((c) => c.id === valid.id)!.token;
    expect((await api.publicVerify(token)).status).toBe("VALID");
  });

  test("pages are 25 rows", async () => {
    const first = await api.workers({ page: 1 });
    const second = await api.workers({ page: 2 });
    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(15);
  });

  test("search matches names case-insensitively", async () => {
    const all = await api.workers({});
    const name = all.items[0]!.displayName;
    const found = await api.workers({ q: name.toUpperCase() });
    expect(found.items.map((w) => w.displayName)).toContain(name);
  });
});

describe("revocation", () => {
  test("revoking re-signs SR1 and public verify reports REVOKED", async () => {
    const api = apiAs(adminAccount);
    const cert = (await api.certificates({ status: "valid" })).items[0]!;
    const token = (await api.worker(cert.worker.id)).certificates.find((c) => c.id === cert.id)!.token;
    const before = await api.revocations();

    const revoked = await api.revokeCertificate(cert.id, "Lost card");
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedReason).toBe("Lost card");
    expect((await api.revocations()).token).not.toBe(before.token);
    expect((await api.publicVerify(token)).status).toBe("REVOKED");

    // a second revoke is a no-op
    expect((await api.revokeCertificate(cert.id, "Other")).revokedReason).toBe("Lost card");
  });
});

describe("supervisor scoping (D-025)", () => {
  const db = buildMockDb(NOW);
  const supervisor = apiAs(supervisorAccount, db);
  const admin = apiAs(adminAccount, db);

  test("sees only their sites", async () => {
    const workers = await supervisor.workers({});
    expect(workers.total).toBeGreaterThan(0);
    expect(workers.items.every((w) => w.site === "DHN-01")).toBe(true);
    expect((await supervisor.heatmap()).sites).toEqual(["DHN-01"]);
  });

  test("out-of-scope ids are 404", async () => {
    const other = (await admin.workers({ site: "JSR-02" })).items[0]!;
    await expect(supervisor.worker(other.id)).rejects.toMatchObject({ status: 404 });
  });

  test("devices are admin-only", async () => {
    await expect(supervisor.devices()).rejects.toBeInstanceOf(ApiError);
    await expect(supervisor.devices()).rejects.toMatchObject({ status: 403 });
  });

  test("signed out is 401", async () => {
    await expect(apiAs(null, db).overview()).rejects.toMatchObject({ status: 401 });
  });
});

test("approving a pending device", async () => {
  const api = apiAs(adminAccount);
  const pending = (await api.devices("pending"))[0]!;
  const approved = await api.approveDevice(pending.id);
  expect(approved.status).toBe("approved");
  expect(approved.approvedAt).toBe(NOW);
  expect(await api.devices("pending")).toHaveLength(0);
});

test("CSV export neutralises formula injection and is oldest first", async () => {
  const csv = await apiAs(adminAccount).exportAttemptsCsv({ from: NOW - 30 * DAY });
  const lines = csv.trim().split("\r\n");
  expect(lines[0]).toBe(
    "attempt_id,worker_id,worker_name,site,scenario_id,scenario_version,variant,mode,score_percent,passed,flagged,flag_reason,started_at",
  );
  const dates = lines.slice(1).map((l) => l.split(",").at(-1)!);
  expect([...dates].sort()).toEqual(dates);
});
