import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { passRateColor } from "../compliance/CompliancePage";
import { renderRoute } from "../../test/render";
import { signInAs, signOut } from "../../test/session";

beforeEach(() => signInAs());
afterEach(() => signOut());

test("overview shows KPI cards, failed rules and the latest 10 attempts", async () => {
  renderRoute("/");
  expect(await screen.findByText("Workers")).toBeInTheDocument();
  expect(await screen.findByText("40")).toBeInTheDocument();
  expect(screen.getByText("Recert due (30 days)").nextSibling).toHaveTextContent("12");
  const table = await screen.findByRole("table", { name: "Top failed rules" });
  expect(within(table).getAllByRole("row")[0]).toHaveTextContent("R_BUDDY_CHECK");
  const latest = await screen.findByRole("link", { name: "All attempts →" });
  expect(latest).toBeInTheDocument();
  const rows = screen.getAllByRole("row").filter((r) => within(r).queryByText(/%$/));
  expect(rows.length).toBe(10);
});

test("a heatmap cell opens the filtered attempts", async () => {
  const user = userEvent.setup();
  renderRoute("/compliance");
  const cell = await screen.findByRole("button", { name: /^JSR-02 Gas Leak/ });
  expect(cell).toHaveAccessibleName(/% pass rate, \d+ attempts/);
  await user.click(cell);
  expect(await screen.findByRole("heading", { name: "Attempts" })).toBeInTheDocument();
});

test("supervisors see only their site in the heatmap", async () => {
  await signOut();
  await signInAs("supervisor@demo.suraksha");
  renderRoute("/compliance");
  expect(await screen.findByRole("button", { name: /^DHN-01 Fire/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^JSR-02/ })).not.toBeInTheDocument();
});

test("pass-rate colour runs red to green", () => {
  expect(passRateColor(0)).toBe("hsl(0 70% 42%)");
  expect(passRateColor(100)).toBe("hsl(120 70% 42%)");
  expect(passRateColor(150)).toBe("hsl(120 70% 42%)");
});
