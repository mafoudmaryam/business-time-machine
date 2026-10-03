import { useEffect, useState, type ReactNode } from "react";
import { getConfig } from "../api";
import { ConfigContext, DEFAULT_SETTINGS, type AppSettings } from "./config";

/** Reads GET /config once and shares it with the whole app (see `useConfig`). */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS, loaded: false });

  useEffect(() => {
    let cancelled = false;
    getConfig().then(
      (c) => !cancelled && setSettings({ coachEnabled: c.coach_enabled, studyMode: c.study_mode, loaded: true }),
      () => !cancelled && setSettings({ ...DEFAULT_SETTINGS, loaded: true }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return <ConfigContext.Provider value={settings}>{children}</ConfigContext.Provider>;
}
