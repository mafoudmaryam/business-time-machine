import { describe, expect, it } from "vitest";
import { isStartScreen, parentPath } from "./backTarget";

describe("isStartScreen", () => {
  it("is only / and /start", () => {
    expect(isStartScreen("/")).toBe(true);
    expect(isStartScreen("/start")).toBe(true);
    for (const p of ["/today", "/compare", "/startup", "/scenarios"]) expect(isStartScreen(p)).toBe(false);
  });
});

describe("parentPath", () => {
  it("Today goes up to the start screen", () => {
    expect(parentPath("/today")).toBe("/");
  });

  it("Try a change, Advanced pages, scenarios, results and the timeline go to Today", () => {
    for (const p of ["/scenarios", "/compare", "/history", "/setup", "/watch/12", "/plan/3/print", "/try/price"]) {
      expect(parentPath(p)).toBe("/today");
    }
  });

  it("the start-up guide goes back to the start screen, and a plan back to the guide", () => {
    expect(parentPath("/guide")).toBe("/");
    expect(parentPath("/guide/plan/7")).toBe("/guide");
  });

  it("anything else goes to Today", () => {
    expect(parentPath("/no/such/page")).toBe("/today");
  });
});
