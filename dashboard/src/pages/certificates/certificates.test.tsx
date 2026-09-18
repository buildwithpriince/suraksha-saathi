import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../../api";
import { renderRoute } from "../../test/render";
import { signInAs, signOut } from "../../test/session";
import { recertCsv } from "../recertification/RecertificationPage";

afterEach(() => signOut());

test("status filter narrows the certificate list", async () => {
  await signInAs();
  const user = userEvent.setup();
  renderRoute("/certificates");
  await screen.findAllByRole("button", { name: /^Revoke certificate of/ });
  await user.click(screen.getByRole("button", { name: "Revoked" }));
  await waitFor(() => expect(screen.getByText(/1–1 of 1/)).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /^Revoke certificate of/ })).not.toBeInTheDocument();
});

test("revoke asks for a reason, then confirmation, then updates the row", async () => {
  await signInAs();
  const user = userEvent.setup();
  renderRoute("/certificates?status=valid");
  const [revoke] = await screen.findAllByRole("button", { name: /^Revoke certificate of/ });
  const name = revoke!.getAttribute("aria-label")!.replace("Revoke certificate of ", "");
  await user.click(revoke!);

  const dialog = screen.getByRole("dialog", { name: "Revoke certificate" });
  const submit = within(dialog).getByRole("button", { name: "Revoke" });
  expect(submit).toBeDisabled();
  await user.type(within(dialog).getByLabelText("Reason"), "Card lost on site");
  await user.click(submit);
  await user.click(within(dialog).getByRole("button", { name: "Confirm revoke" }));

  expect(await screen.findByRole("status")).toHaveTextContent(`Revoked ${name}'s certificate`);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const revoked = (await api.certificates({ status: "revoked" })).items.find((c) => c.worker.displayName === name);
  expect(revoked?.revokedReason).toBe("Card lost on site");
});

test("Escape closes the revoke dialog without revoking", async () => {
  await signInAs();
  const user = userEvent.setup();
  renderRoute("/certificates?status=expiring");
  const [revoke] = await screen.findAllByRole("button", { name: /^Revoke certificate of/ });
  await user.click(revoke!);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("recertification lists 12 due in 30 days, sortable, and the window can change", async () => {
  await signInAs();
  const user = userEvent.setup();
  renderRoute("/recertification");
  await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(13));
  const daysLeft = () => screen.getAllByRole("row").slice(1).map((r) => Number(within(r).getAllByRole("cell").at(-1)!.textContent));
  const asc = daysLeft();
  expect([...asc].sort((a, b) => a - b)).toEqual(asc);
  await user.click(screen.getByRole("button", { name: /Days left/ }));
  expect(daysLeft()).toEqual([...asc].reverse().sort((a, b) => b - a));

  const input = screen.getByLabelText("Expires within (days)");
  await user.clear(input);
  await user.type(input, "0");
  await user.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Recertification" }).nextSibling).toHaveTextContent("within 0 days"));
});

test("recert CSV neutralises formulas", () => {
  const csv = recertCsv([{ workerId: "w1", displayName: "=HYPERLINK(1)", site: "DHN-01", expiresAt: 1790000000, daysLeft: 3 }]);
  expect(csv).toBe("worker_id,worker_name,site,expires_at,days_left\r\nw1,'=HYPERLINK(1),DHN-01,2026-09-21T14:13:20Z,3\r\n");
});

test("admins approve pending devices", async () => {
  await signInAs();
  const user = userEvent.setup();
  renderRoute("/devices?status=pending");
  await user.click(await screen.findByRole("button", { name: /^Approve / }));
  expect(await screen.findByText("No devices are waiting for approval.")).toBeInTheDocument();
});

test("supervisors are told devices are admin-only", async () => {
  await signInAs("supervisor@demo.suraksha");
  renderRoute("/devices");
  expect(await screen.findByText(/Only admins can approve/)).toBeInTheDocument();
});
