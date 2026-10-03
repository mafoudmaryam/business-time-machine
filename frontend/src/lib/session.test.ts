import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetBusiness,
  getRememberedBusinessId,
  getSessionId,
  markTourSeen,
  rememberBusiness,
  resetSessionMemory,
  tourSeen,
} from "./session";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetSessionMemory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("remembered business", () => {
  it("is empty at first, then remembered, then forgotten", () => {
    expect(getRememberedBusinessId()).toBeNull();
    rememberBusiness(7);
    expect(getRememberedBusinessId()).toBe(7);
    forgetBusiness();
    expect(getRememberedBusinessId()).toBeNull();
  });

  it("ignores junk", () => {
    for (const junk of ["abc", "-3", "0", "2.5", ""]) {
      window.localStorage.setItem("btm.businessId", junk);
      expect(getRememberedBusinessId()).toBeNull();
    }
  });
});

describe("tour flag", () => {
  it("starts unseen and is remembered", () => {
    expect(tourSeen()).toBe(false);
    markTourSeen();
    expect(tourSeen()).toBe(true);
  });
});

describe("session id", () => {
  it("stays the same within a tab and looks like the API wants", () => {
    const first = getSessionId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(getSessionId()).toBe(first);
  });
});

describe("when storage is blocked", () => {
  function block() {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
  }

  it("nothing throws and the app simply forgets", () => {
    block();
    expect(() => rememberBusiness(3)).not.toThrow();
    expect(getRememberedBusinessId()).toBeNull();
    expect(() => forgetBusiness()).not.toThrow();
    expect(() => markTourSeen()).not.toThrow();
    expect(tourSeen()).toBe(false);
  });

  it("still gives a stable session id from memory", () => {
    block();
    const id = getSessionId();
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(getSessionId()).toBe(id);
  });
});
