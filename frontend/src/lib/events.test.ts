import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { resetEvents, track } from "./events";
import { rememberBusiness } from "./session";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, logEvents: vi.fn() };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api.logEvents).mockReset();
  vi.mocked(api.logEvents).mockResolvedValue({ stored: 1 });
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetEvents();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("track", () => {
  it("sends nothing until a moment has passed, then sends everything in one batch", async () => {
    track("screen_view", "today");
    track("ask_opened", "today", { n: 1 });
    expect(api.logEvents).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(api.logEvents).toHaveBeenCalledTimes(1);
    const [session, business, events] = vi.mocked(api.logEvents).mock.calls[0];
    expect(session).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(business).toBeNull();
    expect(events).toEqual([
      { name: "screen_view", screen: "today" },
      { name: "ask_opened", screen: "today", payload: { n: 1 } },
    ]);
  });

  it("includes the remembered business", async () => {
    rememberBusiness(5);
    track("x_y");
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.mocked(api.logEvents).mock.calls[0][1]).toBe(5);
  });

  it("never throws or blocks when the server is down", async () => {
    vi.mocked(api.logEvents).mockRejectedValue(new Error("down"));
    expect(() => track("screen_view", "today")).not.toThrow();
    await vi.advanceTimersByTimeAsync(500);
    expect(api.logEvents).toHaveBeenCalledTimes(1);
  });

  it("splits a very large queue into batches the server accepts", async () => {
    for (let i = 0; i < 120; i++) track("tick");
    await vi.advanceTimersByTimeAsync(5000);
    const sizes = vi.mocked(api.logEvents).mock.calls.map((c) => c[2].length);
    expect(sizes.every((n) => n <= 50)).toBe(true);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(120);
  });
});
