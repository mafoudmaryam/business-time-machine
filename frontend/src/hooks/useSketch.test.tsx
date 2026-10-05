import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { makeSketch } from "../test-fixtures";
import { SKETCH_DEBOUNCE_MS, useSketch } from "./useSketch";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, previewChange: vi.fn() };
});

const req = (amount: number, start_month = 1): api.SketchRequest => ({ type: "price", amount, start_month });

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.mocked(api.previewChange).mockImplementation((_id, body) => Promise.resolve(makeSketch({ amount: body.amount })));
});

afterEach(() => {
  vi.useRealTimers();
});

const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("useSketch", () => {
  it("asks for the first answer at once, with no waiting", async () => {
    const { result } = renderHook(() => useSketch(1, req(7)));
    expect(result.current.sketch).toBeNull();
    expect(result.current.updating).toBe(true);
    await settle(0);
    expect(api.previewChange).toHaveBeenCalledTimes(1);
    expect(result.current.sketch?.amount).toBe(7);
    expect(result.current.updating).toBe(false);
  });

  it("waits about 200 ms for the slider to settle, then asks once with the last value", async () => {
    const { result, rerender } = renderHook(({ r }) => useSketch(1, r), { initialProps: { r: req(7) } });
    await settle(0);
    vi.mocked(api.previewChange).mockClear();
    for (const a of [8, 9, 10, 11, 12]) {
      rerender({ r: req(a) });
      await settle(50);
    }
    expect(api.previewChange).not.toHaveBeenCalled(); // the slider is still moving
    await settle(SKETCH_DEBOUNCE_MS);
    expect(api.previewChange).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.previewChange).mock.calls[0][1]).toEqual({ type: "price", amount: 12, start_month: 1 });
    expect(result.current.sketch?.amount).toBe(12);
  });

  it("keeps showing the last answer while the next one loads (no blank page)", async () => {
    let release: (s: api.Sketch) => void = () => undefined;
    const { result, rerender } = renderHook(({ r }) => useSketch(1, r), { initialProps: { r: req(7) } });
    await settle(0);
    vi.mocked(api.previewChange).mockImplementation(() => new Promise((res) => { release = res; }));
    rerender({ r: req(9) });
    await settle(SKETCH_DEBOUNCE_MS);
    expect(result.current.updating).toBe(true);
    expect(result.current.sketch?.amount).toBe(7); // the old picture is still there
    await act(async () => release(makeSketch({ amount: 9 })));
    expect(result.current.updating).toBe(false);
    expect(result.current.sketch?.amount).toBe(9);
  });

  it("drops an answer that arrives too late", async () => {
    const resolvers: Record<number, (s: api.Sketch) => void> = {};
    const { result, rerender } = renderHook(({ r }) => useSketch(1, r), { initialProps: { r: req(7) } });
    await settle(0);
    vi.mocked(api.previewChange).mockImplementation((_id, body) => new Promise((res) => { resolvers[body.amount] = res; }));
    rerender({ r: req(9) });
    await settle(SKETCH_DEBOUNCE_MS);          // request for 9 is now in flight
    rerender({ r: req(12) });
    await settle(SKETCH_DEBOUNCE_MS);          // request for 12 starts; 9 is cancelled
    await act(async () => resolvers[12](makeSketch({ amount: 12 })));
    await act(async () => resolvers[9](makeSketch({ amount: 9 })));   // the slow, old answer
    expect(result.current.sketch?.amount).toBe(12);
  });

  it("cancels the older request when the slider moves again", async () => {
    const { rerender } = renderHook(({ r }) => useSketch(1, r), { initialProps: { r: req(7) } });
    await settle(0);
    vi.mocked(api.previewChange).mockImplementation(() => new Promise(() => undefined));
    rerender({ r: req(9) });
    await settle(SKETCH_DEBOUNCE_MS);
    const signal = vi.mocked(api.previewChange).mock.calls.at(-1)![2]!;
    expect(signal.aborted).toBe(false);
    rerender({ r: req(10) });
    expect(signal.aborted).toBe(true);
  });

  it("asks again when the start month changes", async () => {
    const { rerender } = renderHook(({ r }) => useSketch(1, r), { initialProps: { r: req(7, 1) } });
    await settle(0);
    rerender({ r: req(7, 3) });
    await settle(SKETCH_DEBOUNCE_MS);
    expect(vi.mocked(api.previewChange).mock.calls.at(-1)![1].start_month).toBe(3);
  });

  it("if it fails, keeps the old answer and says so; the next success clears it", async () => {
    const { result, rerender } = renderHook(({ r }) => useSketch(1, r), { initialProps: { r: req(7) } });
    await settle(0);
    vi.mocked(api.previewChange).mockRejectedValue(new Error("down"));
    rerender({ r: req(9) });
    await settle(SKETCH_DEBOUNCE_MS);
    expect(result.current.failed).toBe(true);
    expect(result.current.updating).toBe(false);
    expect(result.current.sketch?.amount).toBe(7);
    vi.mocked(api.previewChange).mockImplementation((_id, body) => Promise.resolve(makeSketch({ amount: body.amount })));
    rerender({ r: req(10) });
    await settle(SKETCH_DEBOUNCE_MS);
    expect(result.current.failed).toBe(false);
    expect(result.current.sketch?.amount).toBe(10);
  });

  it("does nothing without a business", async () => {
    const { result } = renderHook(() => useSketch(null, req(7)));
    await settle(1000);
    expect(api.previewChange).not.toHaveBeenCalled();
    expect(result.current.sketch).toBeNull();
    expect(result.current.updating).toBe(false);
  });

  it("stops everything when the page goes away", async () => {
    const { unmount } = renderHook(() => useSketch(1, req(7)));
    vi.mocked(api.previewChange).mockImplementation(() => new Promise(() => undefined));
    await settle(0);
    const signal = vi.mocked(api.previewChange).mock.calls[0][2]!;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
