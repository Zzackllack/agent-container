import { useCallback, useEffect, useState } from "react";

/**
 * Light/dark switching.
 *
 * The palettes live in styles/tokens.css as `light-dark()` pairs, so the only
 * thing this module does is flip `color-scheme` on the root element. "system"
 * removes the override entirely and lets the OS preference win, which also
 * keeps following the OS while the tab is open.
 */

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "agent-dashboard-theme";

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = choice;
}

export function readThemeChoice(): ThemeChoice {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(readThemeChoice);

  useEffect(() => {
    apply(choice);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return { choice, setChoice };
}
