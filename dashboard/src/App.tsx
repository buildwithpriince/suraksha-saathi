import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { ApiError, backend } from "./api";
import { AuthProviderView, ProtectedRoute } from "./auth/AuthContext";
import type { AuthProvider } from "./auth/types";
import { Layout } from "./components/Layout";
import { EmptyState, PageHeader, SkeletonRows } from "./components/ui";
import { LoginPage } from "./pages/login/LoginPage";

// One chunk per screen: /verify on a phone doesn't download the charts
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(async () => ({ default: (await load())[name] }));
const OverviewPage = page(() => import("./pages/overview/OverviewPage"), "OverviewPage");
const CompliancePage = page(() => import("./pages/compliance/CompliancePage"), "CompliancePage");
const WorkersPage = page(() => import("./pages/workers/WorkersPage"), "WorkersPage");
const WorkerDetailPage = page(() => import("./pages/workers/WorkerDetailPage"), "WorkerDetailPage");
const AttemptsPage = page(() => import("./pages/attempts/AttemptsPage"), "AttemptsPage");
const AttemptDetailPage = page(() => import("./pages/attempts/AttemptDetailPage"), "AttemptDetailPage");
const CertificatesPage = page(() => import("./pages/certificates/CertificatesPage"), "CertificatesPage");
const RecertificationPage = page(() => import("./pages/recertification/RecertificationPage"), "RecertificationPage");
const DevicesPage = page(() => import("./pages/devices/DevicesPage"), "DevicesPage");
const VerifyPage = page(() => import("./pages/verify/VerifyPage"), "VerifyPage");

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

function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState message="There's nothing at this address." action={<a className="link" href="/">Go to the overview</a>} />
    </>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-8"><SkeletonRows /></div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<OverviewPage />} />
            <Route path="compliance" element={<CompliancePage />} />
            <Route path="workers" element={<WorkersPage />} />
            <Route path="workers/:id" element={<WorkerDetailPage />} />
            <Route path="attempts" element={<AttemptsPage />} />
            <Route path="attempts/:id" element={<AttemptDetailPage />} />
            <Route path="certificates" element={<CertificatesPage />} />
            <Route path="recertification" element={<RecertificationPage />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
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
