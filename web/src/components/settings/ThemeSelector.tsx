import { Sun, Moon, Monitor } from "lucide-react";
import type { AppSettings } from "@/lib/settings";

interface ThemeSelectorProps {
  theme: string;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

export default function ThemeSelector({ theme, onUpdate }: ThemeSelectorProps) {
  const Icon = theme === "light" ? Sun : theme === "system" ? Monitor : Moon;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Theme</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose your preferred appearance.
      </p>
      <div className="flex gap-2">
        {(
          [
            ["dark", "Dark", Moon],
            ["light", "Light", Sun],
            ["system", "System", Monitor],
          ] as const
        ).map(([mode, label, IconCmp]) => (
          <button
            key={mode}
            onClick={() => onUpdate({ theme: mode })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
              theme === mode
                ? "bg-primary/15 text-primary border-primary/20"
                : "bg-muted text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            <IconCmp className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
