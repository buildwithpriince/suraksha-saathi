import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import vectors from "../../../../content/trust/test-vectors.json";
import { api } from "../../api";
import { renderRoute } from "../../test/render";
import { signInAs, signOut } from "../../test/session";

const setOnline = (value: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });

beforeEach(() => {
  localStorage.clear();
  setOnline(true);
});

async function demoToken(status: "valid" | "expired" | "revoked") {
  await signInAs();
  const cert = (await api.certificates({ status })).items[0]!;
  const token = (await api.worker(cert.worker.id)).certificates.find((c) => c.id === cert.id)!.token;
  await signOut();
  return { token, name: cert.worker.displayName };
}

async function paste(token: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText("Or paste the certificate text"));
  await user.paste(token);
  await user.click(screen.getByRole("button", { name: "Check" }));
}

test("/verify is public and mobile-first", async () => {
  renderRoute("/verify");
  expect(await screen.findByRole("heading", { name: "Verify a certificate" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Scan QR code with camera" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
});

test("a valid demo certificate: offline check, then live status and list freshness", async () => {
  const { token, name } = await demoToken("valid");
  renderRoute("/verify");
  await paste(token);
  expect(await screen.findByRole("status", { name: "Certificate status: Valid" })).toBeInTheDocument();
  expect(screen.getByText(name)).toBeInTheDocument();
  expect(await screen.findByText("Checked online: Valid")).toBeInTheDocument();
  expect(screen.getByText("Checked on this device: Valid")).toBeInTheDocument();
  expect(screen.getByText(/^Revocation list updated/)).toBeInTheDocument();
});

test("a revoked certificate reads Revoked", async () => {
  const { token } = await demoToken("revoked");
  renderRoute(`/verify?token=${encodeURIComponent(token)}`);
  expect(await screen.findByRole("status", { name: "Certificate status: Revoked" })).toBeInTheDocument();
  expect(await screen.findByText("Checked online: Revoked")).toBeInTheDocument();
});

test("an expired certificate reads Expired", async () => {
  const { token } = await demoToken("expired");
  renderRoute(`/verify?token=${encodeURIComponent(token)}`);
  expect(await screen.findByRole("status", { name: "Certificate status: Expired" })).toBeInTheDocument();
  expect(await screen.findByText("Checked online: Expired")).toBeInTheDocument();
});

test("the tampered vector is Invalid with the signature reason", async () => {
  renderRoute("/verify");
  await paste(vectors.tampered);
  expect(await screen.findByRole("status", { name: "Certificate status: Invalid" })).toBeInTheDocument();
  expect(screen.getByText(/signature doesn't match/)).toBeInTheDocument();
  expect(await screen.findByText("Checked online: Invalid")).toBeInTheDocument();
});

test("offline with no cached list: on-device check only, revocation status unknown", async () => {
  const { token } = await demoToken("valid");
  setOnline(false);
  renderRoute("/verify");
  await paste(token);
  expect(await screen.findByRole("status", { name: "Certificate status: Valid" })).toBeInTheDocument();
  expect(screen.getByText("Offline: showing the on-device check only.")).toBeInTheDocument();
  expect(screen.getByText("Revocation status unknown (offline, no list)")).toBeInTheDocument();
});

test("offline with a cached list still catches a revoked certificate", async () => {
  const { token } = await demoToken("revoked");
  renderRoute("/verify");
  await paste(vectors.cert); // online once: caches the signed list
  await waitFor(() => expect(localStorage.getItem("ss.revocations")).not.toBeNull());

  setOnline(false);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Or paste the certificate text"));
  await paste(token);
  expect(await screen.findByRole("status", { name: "Certificate status: Revoked" })).toBeInTheDocument();
  expect(screen.getByText("Offline: showing the on-device check only.")).toBeInTheDocument();
});
