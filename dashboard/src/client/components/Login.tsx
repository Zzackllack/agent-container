import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { api } from "../api";
import { Logo } from "./Logo";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("session", { method: "POST", body: { password } });
      setPassword("");
      onLogin();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-panel">
        <Logo className="brand-mark" />
        <span className="login-brand">agent-container</span>
        <h1>
          Your workspace,
          <br />
          configured.
        </h1>
        <p>Manage the instructions and settings your coding agents use.</p>
        <form onSubmit={submit}>
          <label htmlFor="password">Dashboard password</label>
          <div className="password-input">
            <KeyRound size={17} />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              required
            />
          </div>
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Open dashboard"}
            <ArrowRight size={16} />
          </button>
        </form>
        <details>
          <summary>Where is the password?</summary>
          <p>On the Docker host, run:</p>
          <code>
            docker compose exec dashboard cat /var/lib/agent-dashboard/password
          </code>
        </details>
        <div className="login-foot">
          Runs on your box. Files stay in your volumes.
        </div>
      </div>
      <div className="login-aside" aria-hidden="true">
        <div className="file-illustration">
          <div>
            <span />
            <span />
            <span />
          </div>
          <p>AGENTS.md</p>
          <pre>
            {
              "# Workspace instructions\n\nUse the tools this project provides.\nKeep changes small and reviewable.\nRun the checks that matter.\n\n## Development\n\nBuild. Test. Iterate."
            }
          </pre>
          <span className="illustration-label">
            <span className="status-dot" /> Local source
          </span>
        </div>
      </div>
    </main>
  );
}
