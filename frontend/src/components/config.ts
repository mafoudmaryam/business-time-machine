import { createContext, useContext } from "react";

export interface AppSettings {
  /** The coach can be switched off on the server (for the no-coach study group). */
  coachEnabled: boolean;
  /** Reserved for the study release (participant codes, questionnaires). Always false for now. */
  studyMode: boolean;
  loaded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = { coachEnabled: true, studyMode: false, loaded: true };

export const ConfigContext = createContext<AppSettings>(DEFAULT_SETTINGS);

/** Every screen that shows the coach asks this, so "coach off" is one switch. */
export function useConfig(): AppSettings {
  return useContext(ConfigContext);
}
