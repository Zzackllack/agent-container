// Applies the saved colour theme before the first paint, otherwise a reload in
// dark mode flashes the light palette. This lives in its own file because the
// dashboard serves a strict `script-src 'self'` policy, which rejects inline
// scripts. Storage key must match STORAGE_KEY in src/client/theme.ts.
try {
  const saved = localStorage.getItem("agent-dashboard-theme");
  if (saved === "light" || saved === "dark")
    document.documentElement.dataset.theme = saved;
} catch {
  // Storage disabled (private mode): stay on the system theme.
}
