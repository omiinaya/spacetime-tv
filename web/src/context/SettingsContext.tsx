import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  hashPin,
  verifyPin,
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
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [adultUnlocked, setAdultUnlocked] = useState(false);

  // Load on mount
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

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

  const unlockAdult = useCallback(async (pin: string): Promise<boolean> => {
    const valid = await verifyPin(pin, settings.adultPin);
    if (valid) setAdultUnlocked(true);
    return valid;
  }, [settings.adultPin]);

  const lockAdult = useCallback(() => {
    setAdultUnlocked(false);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update, reset, adultUnlocked, setAdultPin, clearAdultPin, unlockAdult, lockAdult }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
