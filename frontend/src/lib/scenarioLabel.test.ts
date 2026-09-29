import { describe, expect, it } from "vitest";
import { displayScenarioName, nextVersionName } from "./scenarioLabel";

describe("displayScenarioName", () => {
  it("renames the engine's 'baseline' to plain language", () => {
    expect(displayScenarioName("baseline")).toBe("If you change nothing");
  });

  it("leaves every other scenario name untouched", () => {
    expect(displayScenarioName("Price +10% in March")).toBe("Price +10% in March");
  });
});

describe("nextVersionName", () => {
  it("adds v2 to a scenario that has no version yet", () => {
    expect(nextVersionName("Price +10% in March", ["Price +10% in March"])).toBe("Price +10% in March v2");
  });

  it("counts up v2, v3, v4 instead of stacking suffixes", () => {
    const names = ["Price rise"];
    const v2 = nextVersionName("Price rise", names);
    names.push(v2);
    const v3 = nextVersionName(v2, names);
    names.push(v3);
    const v4 = nextVersionName(v3, names);
    expect([v2, v3, v4]).toEqual(["Price rise v2", "Price rise v3", "Price rise v4"]);
  });

  it("cleans up names that already stack suffixes", () => {
    expect(nextVersionName("Price rise v2 v2", ["Price rise", "Price rise v2 v2"])).toBe("Price rise v2");
  });

  it("skips version numbers that already exist", () => {
    expect(nextVersionName("Price rise v2", ["Price rise", "Price rise v2", "Price rise v3"])).toBe("Price rise v4");
  });
});
