import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { backend } from "./api";
import { MOCK_PASSWORD } from "./auth/mock";
import { renderRoute } from "./test/render";

afterEach(async () => {
  await backend.auth.signOut();
});

test("runs in mock mode when no backend is configured", () => {
  expect(backend.mode).toBe("mock");
});

test("protected routes redirect to login", async () => {
  renderRoute("/workers");
  expect(await screen.findByRole("heading", { name: "Suraksha Saathi" })).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toBeInTheDocument();
});

test("signing in returns to the page the user asked for", async () => {
  const user = userEvent.setup();
  renderRoute("/certificates");
  await user.type(await screen.findByLabelText("Email"), "admin@demo.suraksha");
  await user.type(screen.getByLabelText("Password"), MOCK_PASSWORD);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("heading", { name: "Certificates" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  expect(screen.getByText("admin@demo.suraksha")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Sign out" }));
  expect(await screen.findByLabelText("Email")).toBeInTheDocument();
});

test("a wrong password shows an error", async () => {
  const user = userEvent.setup();
  renderRoute("/");
  await user.type(await screen.findByLabelText("Email"), "admin@demo.suraksha");
  await user.type(screen.getByLabelText("Password"), "nope");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
});
