import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  hashPin,
  verifyPin,
  type ThemeMode,
} from "@/lib/settings";

interface SettingsContextType {
  settings: AppSettings;
  update: (partial: Partial<AppSettings>) => void;
  reset: () => void;
  adultUnlocked: boolean;
  setAdultPin: (pin: string) => Promise<void>;
  clearAdultPin: () => void;
  unlockAdult: (pin: string) => Promise<boolean>;
  lockAdult: () => void;
  /** Resolved theme: 'dark' or 'light' (accounts for 'system' preference) */
  resolvedTheme: "dark" | "light";
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
  adultUnlocked: false,
  setAdultPin: async () => {},
  clearAdultPin: () => {},
  unlockAdult: async () => false,
  lockAdult: () => {},
  resolvedTheme: "dark",
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [adultUnlocked, setAdultUnlocked] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  // Load on mount
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // ── Theme application ─────────────────────────────────────────
  useEffect(() => {
    const resolveAndApply = (mode: ThemeMode) => {
      let theme: "dark" | "light";
      if (mode === "system") {
        theme = window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
      } else {
        theme = mode;
      }
      setResolvedTheme(theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.classList.toggle("light", theme === "light");
    };

    resolveAndApply(settings.theme);

    // Listen for system preference changes when in "system" mode
    if (settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = () => resolveAndApply("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [settings.theme]);

  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    setAdultUnlocked(false);
  }, []);

  const setAdultPin = useCallback(async (pin: string) => {
    const hash = await hashPin(pin);
    setSettings((prev) => {
      const next = { ...prev, adultPin: hash };
      saveSettings(next);
      return next;
    });
  }, []);

  const clearAdultPin = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, adultPin: "" };
      saveSettings(next);
      return next;
    });
    setAdultUnlocked(false);
  }, []);

  const unlockAdult = useCallback(
    async (pin: string): Promise<boolean> => {
      const valid = await verifyPin(pin, settings.adultPin);
      if (valid) setAdultUnlocked(true);
      return valid;
    },
    [settings.adultPin],
  );

  const lockAdult = useCallback(() => {
    setAdultUnlocked(false);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        update,
        reset,
        adultUnlocked,
        setAdultPin,
        clearAdultPin,
        unlockAdult,
        lockAdult,
        resolvedTheme,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
