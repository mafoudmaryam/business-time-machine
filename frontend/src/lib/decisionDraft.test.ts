import { describe, expect, it } from "vitest";
import { DEFAULT_BASELINE_FORM } from "../api";
import { BASELINE_STEPS } from "../constants";
import type { ScenarioOut } from "../api";
import { baselineProblems, decisionProblems, defaultDecision, findSamePlan, planName } from "./decisionDraft";

describe("defaultDecision", () => {
  it("is never confirmed: the owner has to say yes first", () => {
    expect(defaultDecision("price").confirmed).toBe(false);
  });

  it("suggests opening a little more than today", () => {
    expect(defaultDecision("hours", { ...DEFAULT_BASELINE_FORM, open_days: 26 }).value).toBe(28);
  });
});

describe("decisionProblems", () => {
  it("accepts a normal price rise", () => {
    expect(decisionProblems({ ...defaultDecision("price"), start_month: 3 })).toEqual({});
  });

  it("rejects an empty number and a month outside the simulation", () => {
    const p = decisionProblems({ ...defaultDecision("price"), value: NaN, start_month: 40 });
    expect(p.value).toBe("Enter a number.");
    expect(p.start_month).toMatch(/1 to 36/);
  });

  it("rejects more than 31 open days", () => {
    expect(decisionProblems({ ...defaultDecision("hours"), value: 32 }).value).toMatch(/31/);
  });

  it("rejects a price cut of 100% or more", () => {
    expect(decisionProblems({ ...defaultDecision("price"), value: -100 }).value).toBeDefined();
  });
});

describe("baselineProblems", () => {
  it("flags empty and out-of-range numbers", () => {
    const fields = BASELINE_STEPS[0].fields;
    const p = baselineProblems(fields, { ...DEFAULT_BASELINE_FORM, customers: NaN, churn_rate: 120 });
    expect(p.customers).toBe("Enter a number.");
    expect(p.churn_rate).toMatch(/at most 100/);
  });
});

describe("planName", () => {
  it("joins the steps", () => {
    expect(planName(["Raise prices 10% from month 3", "Hire 1 barista from month 6"], [])).toBe(
      "Raise prices 10% from month 3 + Hire 1 barista from month 6",
    );
  });

  it("adds a number when the name is taken", () => {
    expect(planName(["Raise prices 10% from month 3"], ["raise prices 10% from month 3"])).toBe(
      "Raise prices 10% from month 3 (2)",
    );
  });

  it("keeps very long names short", () => {
    expect(planName(["x".repeat(100)], []).length).toBeLessThanOrEqual(80);
  });
});

describe("findSamePlan", () => {
  const saved: ScenarioOut = {
    id: 7, business_id: 1, name: "Raise prices", parent_scenario_id: null, parent_scenario_name: null, created_at: "",
    decisions: [{ id: 1, type: "price", start_month: 3, value: 10, unit: "percent", extra: {}, source: "user", confirmed: true }],
  };

  it("finds a saved plan with the same steps", () => {
    expect(findSamePlan([{ ...defaultDecision("price"), start_month: 3 }], [saved])?.id).toBe(7);
  });

  it("ignores a different plan", () => {
    expect(findSamePlan([{ ...defaultDecision("price"), start_month: 4 }], [saved])).toBeNull();
  });

  it("ignores a saved plan that was never confirmed", () => {
    const unconfirmed = { ...saved, decisions: [{ ...saved.decisions[0], confirmed: false }] };
    expect(findSamePlan([{ ...defaultDecision("price"), start_month: 3 }], [unconfirmed])).toBeNull();
  });
});
