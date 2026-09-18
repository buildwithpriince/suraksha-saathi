import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { ApiError, backend } from "./api";
import { AuthProviderView, ProtectedRoute } from "./auth/AuthContext";
import type { AuthProvider } from "./auth/types";
import { Layout } from "./components/Layout";
import { PageHeader } from "./components/ui";
import { AttemptDetailPage } from "./pages/attempts/AttemptDetailPage";
import { AttemptsPage } from "./pages/attempts/AttemptsPage";
import { CompliancePage } from "./pages/compliance/CompliancePage";
import { LoginPage } from "./pages/login/LoginPage";
import { OverviewPage } from "./pages/overview/OverviewPage";
import { WorkerDetailPage } from "./pages/workers/WorkerDetailPage";
import { WorkersPage } from "./pages/workers/WorkersPage";

export function createQueryClient(auth: AuthProvider = backend.auth) {
  return new QueryClient({
    queryCache: new QueryCache({
      // An expired or revoked JWT: back to the login page
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) void auth.signOut();
      },
    }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  });
}

function Placeholder({ title }: { title: string }) {
  return <PageHeader title={title} subtitle="Coming soon." />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="workers" element={<WorkersPage />} />
          <Route path="workers/:id" element={<WorkerDetailPage />} />
          <Route path="attempts" element={<AttemptsPage />} />
          <Route path="attempts/:id" element={<AttemptDetailPage />} />
          <Route path="certificates" element={<Placeholder title="Certificates" />} />
          <Route path="recertification" element={<Placeholder title="Recertification" />} />
          <Route path="devices" element={<Placeholder title="Devices" />} />
          <Route path="*" element={<Placeholder title="Page not found" />} />
        </Route>
      </Route>
    </Routes>
  );
}

export function Providers({ children, client, auth = backend.auth }: { children: ReactNode; client: QueryClient; auth?: AuthProvider }) {
  return (
    <QueryClientProvider client={client}>
      <AuthProviderView provider={auth}>{children}</AuthProviderView>
    </QueryClientProvider>
  );
}

const queryClient = createQueryClient();

export function App() {
  return (
    <Providers client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  );
}
