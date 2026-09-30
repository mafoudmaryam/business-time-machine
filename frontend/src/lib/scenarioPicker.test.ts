import { describe, expect, it } from "vitest";
import type { ScenarioOut } from "../api";
import { needsCheck, parseVersion, scenarioSentences, splitVersions } from "./scenarioPicker";

function s(id: number, name: string, confirmed = true): ScenarioOut {
  return {
    id, business_id: 1, name, parent_scenario_id: null, parent_scenario_name: null, created_at: "x",
    decisions: [{ id, type: "hiring", start_month: 2, value: 1, unit: "fte", extra: {}, source: "user", confirmed }],
  };
}

describe("scenario picker helpers", () => {
  it("reads a version from the name", () => {
    expect(parseVersion("Price rise")).toEqual({ base: "Price rise", version: 1 });
    expect(parseVersion("Price rise v3")).toEqual({ base: "Price rise", version: 3 });
    expect(parseVersion("v2")).toEqual({ base: "v2", version: 1 });
  });

  it("keeps the newest version of each family, in the original order", () => {
    const list = [s(1, "A"), s(2, "B"), s(3, "A v2"), s(4, "a v3"), s(5, "C v2")];
    const { latest, older } = splitVersions(list);
    expect(latest.map((x) => x.id)).toEqual([2, 4, 5]);
    expect(older.map((x) => x.id)).toEqual([1, 3]);
  });

  it("does not treat 'Parent + idea' scenarios as versions of the parent", () => {
    const { latest, older } = splitVersions([s(1, "Raise prices"), s(2, "Raise prices + Add one more barista")]);
    expect(latest).toHaveLength(2);
    expect(older).toHaveLength(0);
  });

  it("needs a check when any decision is unconfirmed", () => {
    expect(needsCheck(s(1, "A", true))).toBe(false);
    expect(needsCheck(s(1, "A", false))).toBe(true);
  });

  it("words each decision in the business's own words", () => {
    expect(scenarioSentences(s(1, "A"), "baker", "USD")).toEqual(["Hire 1 baker from month 2"]);
  });
});
