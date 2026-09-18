import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppRoutes, createQueryClient, Providers } from "../App";
import type { AuthProvider } from "../auth/types";

/** The full route tree at `path`, with a fresh query cache. */
export function renderRoute(path: string, auth?: AuthProvider) {
  const client = createQueryClient(auth);
  return render(
    <Providers client={client} {...(auth ? { auth } : {})}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </Providers>,
  );
}
