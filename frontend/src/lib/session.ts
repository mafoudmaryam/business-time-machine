/** Small things the browser remembers for convenience (which business, whether the tour was seen).
 * Every access is wrapped: private windows and blocked storage can throw, and the app must work without it. */

const BUSINESS_KEY = "btm.businessId";
const TOUR_KEY = "btm.tourSeen";
const SESSION_KEY = "btm.sessionId";

type Store = "local" | "session";

function area(store: Store): Storage {
  return store === "local" ? window.localStorage : window.sessionStorage;
}

function read(store: Store, key: string): string | null {
  try {
    return area(store).getItem(key);
  } catch {
    return null;
  }
}

function write(store: Store, key: string, value: string): void {
  try {
    area(store).setItem(key, value);
  } catch {
    /* storage unavailable: the app still works, it just forgets */
  }
}

function remove(store: Store, key: string): void {
  try {
    area(store).removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getRememberedBusinessId(): number | null {
  const raw = read("local", BUSINESS_KEY);
  const id = raw === null ? NaN : Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function rememberBusiness(id: number): void {
  write("local", BUSINESS_KEY, String(id));
}

export function forgetBusiness(): void {
  remove("local", BUSINESS_KEY);
}

export function tourSeen(): boolean {
  return read("local", TOUR_KEY) === "1";
}

export function markTourSeen(): void {
  write("local", TOUR_KEY, "1");
}

let memorySessionId: string | null = null;

function makeId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A random id for this browser tab, so events from one visit can be put together. Not a person's identity. */
export function getSessionId(): string {
  const stored = read("session", SESSION_KEY);
  if (stored) return stored;
  memorySessionId ??= makeId();
  write("session", SESSION_KEY, memorySessionId);
  return memorySessionId;
}

/** For tests. */
export function resetSessionMemory(): void {
  memorySessionId = null;
}
