import { Monitor, Moon, Sun } from "lucide-react";
import { type ThemeChoice, useTheme } from "../theme";

const OPTIONS: Array<{
  choice: ThemeChoice;
  label: string;
  icon: typeof Sun;
}> = [
  { choice: "system", label: "Match system theme", icon: Monitor },
  { choice: "light", label: "Light theme", icon: Sun },
  { choice: "dark", label: "Dark theme", icon: Moon },
];

export function ThemeSwitch() {
  const { choice, setChoice } = useTheme();
  return (
    <div className="theme-switch" role="group" aria-label="Colour theme">
      {OPTIONS.map(({ choice: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={choice === option}
          aria-label={label}
          title={label}
          onClick={() => setChoice(option)}
        >
          <Icon size={13} strokeWidth={1.8} />
        </button>
      ))}
    </div>
  );
}
