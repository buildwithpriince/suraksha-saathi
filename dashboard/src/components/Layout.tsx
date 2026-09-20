import { NavLink, Outlet } from "react-router";
import { backend } from "../api";
import { Lockup } from "./Logo";
import { useAuth } from "../auth/AuthContext";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/compliance", label: "Compliance" },
  { to: "/workers", label: "Workers" },
  { to: "/attempts", label: "Attempts" },
  { to: "/certificates", label: "Certificates" },
  { to: "/recertification", label: "Recertification" },
  { to: "/devices", label: "Devices" },
];

export function DemoBanner() {
  if (backend.mode !== "mock") return null;
  return (
    <div className="bg-safety px-4 py-1.5 text-center text-xs font-medium text-white">
      Demo data: the backend isn't connected, so this runs on built-in sample data signed with test keys.
    </div>
  );
}

export function Layout() {
  const { session, signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="bg-navy text-white md:w-60 md:shrink-0">
          <div className="px-5 py-5">
            <Lockup tone="white" subtitle="Compliance dashboard" />
          </div>
          <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-3 py-2 text-sm ${isActive ? "bg-white/15 font-semibold" : "text-blue-100 hover:bg-white/10"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/verify" className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-blue-100 hover:bg-white/10">
              Verify a certificate ↗
            </NavLink>
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3 text-sm">
            <span className="text-slate-600">{session?.email}</span>
            <button type="button" className="btn-secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
