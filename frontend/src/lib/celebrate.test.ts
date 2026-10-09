import { afterEach, describe, expect, it, vi } from "vitest";
import { celebrate } from "./celebrate";

function mockMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query }));
}

describe("celebrate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("adds confetti that nobody can click, then removes it", () => {
    vi.useFakeTimers();
    mockMotion(false);
    celebrate();
    const layer = document.querySelector(".confetti-layer");
    expect(layer).not.toBeNull();
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.querySelectorAll(".confetti-piece").length).toBeGreaterThan(10);
    vi.advanceTimersByTime(3000);
    expect(document.querySelector(".confetti-layer")).toBeNull();
  });

  it("does nothing when the person asked for less motion", () => {
    mockMotion(true);
    celebrate();
    expect(document.querySelector(".confetti-layer")).toBeNull();
  });
});
