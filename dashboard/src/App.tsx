import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-navy">Suraksha Saathi</h1>
      <p className="text-slate-600">Compliance dashboard</p>
    </main>
  );
}
