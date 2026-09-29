import { useEffect, useSyncExternalStore } from "react";
import { ApiError, getCoach, getCoachStatus, requestCoach, type CoachOut, type CoachStatus } from "../api";

/** Everything the advisor knows about the coach for one simulation run.
 *  - loading: asked the backend, waiting
 *  - ready:   `coach` is filled in (it may still be the rule-based version while the AI writes)
 *  - error:   something went wrong; `retryCoach` tries again
 *  - off:     the coach is switched off (the no-coach study group) */
export interface CoachEntry {
  state: "loading" | "ready" | "error" | "off";
  coach: CoachOut | null;
  error: string | null;
  /** True once the AI's more detailed version has replaced the rule-based one on screen. */
  updated: boolean;
}

const POLL_EVERY_MS = 3000;
const POLL_LIMIT_MS = 15 * 60 * 1000;

// A tiny shared store. Several parts of the page show the same run's coach (its message bubble,
// the "Why?" and "What could go wrong?" buttons), so the data lives here once instead of being
// fetched by each part. React components subscribe with the hooks below.
const entries = new Map<number, CoachEntry>();
const pollers = new Map<number, ReturnType<typeof setInterval>>();
const listeners = new Set<() => void>();
let status: CoachStatus | null = null;
let statusRequested = false;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(runId: number, entry: CoachEntry) {
  entries.set(runId, entry); // always a new object, so React notices the change
  emit();
}

export function friendlyCoachError(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) return "I can't reach the app right now. Is it running?";
  return "I couldn't put my thoughts together this time, but the numbers above are still right.";
}

function startPolling(runId: number) {
  if (pollers.has(runId)) return;
  const started = Date.now();
  const timer = setInterval(() => {
    getCoach(runId).then(
      (c) => {
        if (c.ai_status === "pending") return;
        clearInterval(timer);
        pollers.delete(runId);
        set(runId, { state: "ready", coach: c, error: null, updated: c.ai_status === "done" });
      },
      () => undefined, // a failed check is ignored: the rule-based coach stays on screen
    );
    if (Date.now() - started > POLL_LIMIT_MS) {
      clearInterval(timer);
      pollers.delete(runId);
    }
  }, POLL_EVERY_MS);
  pollers.set(runId, timer);
}

function load(runId: number) {
  set(runId, { state: "loading", coach: null, error: null, updated: false });
  requestCoach(runId).then(
    (c) => {
      set(runId, { state: "ready", coach: c, error: null, updated: false });
      if (c.ai_status === "pending") startPolling(runId);
    },
    (err) => {
      if (err instanceof ApiError && err.status === 404 && /switched off/i.test(err.message)) {
        set(runId, { state: "off", coach: null, error: null, updated: false });
      } else {
        set(runId, { state: "error", coach: null, error: friendlyCoachError(err), updated: false });
      }
    },
  );
}

function loadStatus() {
  if (statusRequested) return;
  statusRequested = true;
  getCoachStatus().then(
    (s) => {
      status = s;
      emit();
    },
    () => undefined,
  );
}

/** The coach for one run. Starts fetching the first time any component asks for it. */
export function useCoach(runId: number | null): CoachEntry | undefined {
  const entry = useSyncExternalStore(subscribe, () => (runId === null ? undefined : entries.get(runId)));
  useEffect(() => {
    loadStatus();
    if (runId !== null && !entries.has(runId)) load(runId);
  }, [runId]);
  return entry;
}

/** Whether the coach is on, and whether the server allows showing which coach is answering. */
export function useCoachStatus(): CoachStatus | null {
  const s = useSyncExternalStore(subscribe, () => status);
  useEffect(loadStatus, []);
  return s;
}

export function retryCoach(runId: number) {
  load(runId);
}

/** For tests: forget everything between test cases. */
export function resetCoachStore() {
  for (const timer of pollers.values()) clearInterval(timer);
  pollers.clear();
  entries.clear();
  status = null;
  statusRequested = false;
}
