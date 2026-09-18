import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../../api";
import { renderRoute } from "../../test/render";
import { signInAs, signOut } from "../../test/session";
import { sortRules } from "../attempts/AttemptDetailPage";

beforeEach(() => signInAs());
afterEach(() => signOut());

const bodyRows = () => screen.getAllByRole("row").slice(1);

test("workers table pages and filters by site", async () => {
  const user = userEvent.setup();
  renderRoute("/workers");
  await screen.findByText("1–25 of 40");
  expect(bodyRows()).toHaveLength(25);

  await user.selectOptions(screen.getByRole("combobox", { name: "Site" }), "KDM-03");
  await waitFor(() => expect(bodyRows().every((r) => within(r).queryByText("KDM-03"))).toBe(true));
});

test("an unmatched search shows the empty state with a way out", async () => {
  const user = userEvent.setup();
  renderRoute("/workers");
  await screen.findByText("1–25 of 40");
  await user.type(screen.getByPlaceholderText(/Search by name/), "zzzz");
  expect(await screen.findByText("No workers match these filters.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(await screen.findByText("1–25 of 40")).toBeInTheDocument();
});

test("worker detail shows profile, attempts and certificate QR", async () => {
  const cert = (await api.certificates({ status: "valid" })).items[0]!;
  renderRoute(`/workers/${cert.worker.id}`);
  expect(await screen.findByRole("heading", { name: cert.worker.displayName })).toBeInTheDocument();
  expect(screen.getByText("Employee code")).toBeInTheDocument();
  expect(await screen.findByAltText(`Certificate QR for ${cert.worker.displayName}`)).toBeInTheDocument();
});

test("an unknown worker shows the error state", async () => {
  renderRoute("/workers/00000000-0000-4000-8000-000000000000");
  expect(await screen.findByRole("alert")).toHaveTextContent("Not found");
});

test("attempts filters come from the URL (heatmap click-through)", async () => {
  renderRoute("/attempts?site=JSR-02&scenario=GAS_01");
  await screen.findByRole("combobox", { name: "Site" });
  await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
  for (const row of bodyRows()) {
    expect(row).toHaveTextContent("JSR-02");
    expect(row).toHaveTextContent("Gas Leak");
  }
});

test("flagged attempt detail explains the disagreement", async () => {
  const flagged = (await api.attempts({ flagged: true })).items[0]!;
  renderRoute(`/attempts/${flagged.id}`);
  expect(await screen.findByText(/Flagged: the device's result disagreed/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Rule breakdown" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Event timeline" })).toBeInTheDocument();
  expect(screen.getAllByText("Step started").length).toBeGreaterThan(0);
});

test("rules sort failed criticals first, then lost points", () => {
  const rule = (ruleId: string, earned: number, critical: boolean, passed: boolean) => ({ ruleId, earned, max: 10, critical, passed });
  const sorted = sortRules([rule("FULL", 10, false, true), rule("LOST", 5, false, false), rule("CRIT", 0, true, false)]);
  expect(sorted.map((r) => r.ruleId)).toEqual(["CRIT", "LOST", "FULL"]);
});
