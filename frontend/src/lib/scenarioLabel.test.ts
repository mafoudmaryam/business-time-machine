import { describe, expect, it } from "vitest";
import { displayScenarioName } from "./scenarioLabel";

describe("displayScenarioName", () => {
  it("renames the engine's 'baseline' to plain language", () => {
    expect(displayScenarioName("baseline")).toBe("If you change nothing");
  });

  it("leaves every other scenario name untouched", () => {
    expect(displayScenarioName("Price +10% in March")).toBe("Price +10% in March");
  });
});
