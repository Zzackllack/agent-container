import { useCallback, useEffect, useState } from "react";
import {
  Box,
  FileCode2,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "./api";
import type { Inventory, Overview as OverviewData } from "../shared/types";
import { Login } from "./components/Login";
import { Overview } from "./components/Overview";
import { Documents } from "./components/Documents";
import { Modal } from "./components/Dialog";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { ToolchainList, WorkspaceCard } from "./components/WorkspaceStatus";
import { Logo } from "./components/Logo";

type Page = "overview" | "instructions" | "config";
export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>("instructions");
  const [inventory, setInventory] = useState<Inventory>({
    documents: [],
    warnings: [],
  });
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Page | "logout" | null>(null);
  const refresh = useCallback(() => {
    setError("");
    Promise.all([api<Inventory>("documents"), api<OverviewData>("overview")])
      .then(([files, status]) => {
        setInventory(files);
        setOverview(status);
      })
      .catch((error: Error) => setError(error.message));
  }, []);
  useEffect(() => {
    api<{ authenticated: boolean }>("session")
      .then((result) => setAuthenticated(result.authenticated))
      .catch((error: Error) => {
        setError(error.message);
        setAuthenticated(false);
      });
    const expired = () => setAuthenticated(false);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (authenticated) refresh();
  }, [authenticated, refresh]);
  async function navigate(target: Page | "logout", discard = false) {
    if (dirty && !discard) {
      setPending(target);
      return;
    }
    setPending(null);
    setDirty(false);
    if (target === "logout") {
      try {
        await api("session", { method: "DELETE", body: {} });
        setAuthenticated(false);
      } catch (error) {
        setError((error as Error).message);
      }
    } else setPage(target);
  }
  if (authenticated === null)
    return <div className="initial-loading">Opening dashboard…</div>;
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;
  const navigation = [
    { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
    { id: "instructions" as const, label: "Instructions", icon: FileCode2 },
    { id: "config" as const, label: "Configuration", icon: SlidersHorizontal },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            void navigate("overview");
          }}
        >
          <Logo className="brand-mark" />
          <span>
            agent-container<small>Workspace settings</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "nav-item active" : "nav-item"}
              onClick={() => {
                if (page !== id) void navigate(id);
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <WorkspaceCard overview={overview} />
          <ToolchainList overview={overview} />
          <button className="nav-item" onClick={() => void navigate("logout")}>
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <div className="topbar">
          <span className="topbar-context">
            <Box size={14} />
            Your agent workspace
          </span>
          <div className="topbar-actions">
            <ThemeSwitch />
            <button
              className="icon-button"
              onClick={refresh}
              aria-label="Rescan files"
              title="Rescan files"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        {error ? (
          <div className="notice error" role="alert">
            {error}
            <button className="text-button" onClick={refresh}>
              Try again
            </button>
          </div>
        ) : null}
        {page === "overview" ? (
          <Overview
            overview={overview}
            inventory={inventory}
            refresh={refresh}
            openInstructions={() => void navigate("instructions")}
            openConfiguration={() => void navigate("config")}
          />
        ) : (
          <Documents
            key={page}
            kind={page === "config" ? "config" : "instructions"}
            inventory={inventory}
            refresh={refresh}
            onDirty={setDirty}
          />
        )}
      </main>
      <Modal
        open={pending !== null}
        onOpenChange={(value) => {
          if (!value) setPending(null);
        }}
        title="Leave this draft?"
        description="Your changes have not been saved."
      >
        <div className="dialog-actions">
          <button className="button secondary" onClick={() => setPending(null)}>
            Keep editing
          </button>
          <button
            className="button primary"
            onClick={() => {
              if (pending) void navigate(pending, true);
            }}
          >
            Discard draft
          </button>
        </div>
      </Modal>
    </div>
  );
}
