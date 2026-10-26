import { CURRENCIES } from "../constants";
import type { AnswerDraft } from "./todayView";

const KEY = "btm.setupDraft.v1";
const ANSWERS = ["customers_per_day", "avg_spend", "monthly_rent", "staff"] as const;

export interface SetupDraft {
  industryId: string | null;
  currency: string;
  answers: AnswerDraft;
  name: string;
  step: 0 | 1;
}

/** Store owner input only. The summary is recalculated and confirmed after resuming. */
export function readSetupDraft(): SetupDraft | null {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const d = raw as Record<string, unknown>;
    if (d.version !== 1 || (d.step !== 0 && d.step !== 1) || typeof d.name !== "string" ||
        typeof d.currency !== "string" || !CURRENCIES.includes(d.currency) ||
        !(d.industryId === null || (typeof d.industryId === "string" && d.industryId.length > 0)) ||
        !d.answers || typeof d.answers !== "object") return null;
    const stored = d.answers as Record<string, unknown>;
    const answers = {} as AnswerDraft;
    for (const key of ANSWERS) {
      const value = stored[key];
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) return null;
      answers[key] = value === null ? NaN : value as number;
    }
    return { industryId: d.industryId, currency: d.currency, name: d.name, step: d.step, answers } as SetupDraft;
  } catch {
    return null;
  }
}

export function saveSetupDraft(draft: SetupDraft): boolean {
  try {
    // Empty/incomplete numeric inputs round-trip as empty, never as zero.
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...draft, version: 1 }));
    return true;
  } catch {
    return false;
  }
}

export function clearSetupDraft(): boolean {
  try {
    window.sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
