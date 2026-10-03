import { logEvents, type UiEventIn } from "../api";
import { getRememberedBusinessId, getSessionId } from "./session";

const FLUSH_AFTER_MS = 400;
const MAX_BATCH = 50;

let queue: UiEventIn[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  timer = null;
  const events = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);
  if (events.length === 0) return;
  try {
    await logEvents(getSessionId(), getRememberedBusinessId(), events);
  } catch {
    /* study logging must never get in the owner's way */
  }
  if (queue.length > 0 && timer === null) timer = setTimeout(() => void flush(), FLUSH_AFTER_MS);
}

/** Records that something happened (a screen opened, the tour skipped...). Fire and forget, small and structured:
 * names are lower_snake_case and payloads hold numbers or short codes, never what the owner typed. */
export function track(name: string, screen?: string, payload?: Record<string, unknown>): void {
  queue.push({ name, ...(screen ? { screen } : {}), ...(payload ? { payload } : {}) });
  if (timer === null) timer = setTimeout(() => void flush(), FLUSH_AFTER_MS);
}

/** For tests. */
export function resetEvents(): void {
  queue = [];
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
