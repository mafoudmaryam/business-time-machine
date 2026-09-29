import { describe, expect, it } from "vitest";
import type { CoachIdea, ScenarioOut } from "../api";
import { buildIdeaPrefill, ideaDecisionToForm } from "./coachIdea";

const idea: CoachIdea = {
  title: "Add one more barista",
  why: "Busy months.",
  builds_on: "Raise prices",
  builds_on_scenario_id: 4,
  decisions: [{ type: "hiring", start_month: 5, value: 1, unit: "fte" }],
  decision_texts: ["Hire 1 full-time staff from month 5"],
  result: {
    profit_change_most_likely: 100,
    beats_change_nothing_of_10: 6,
    cash_runs_out_of_10: 0,
    profit_bad_case: 1,
    profit_most_likely: 2,
    profit_good_case: 3,
  },
};

const parent: ScenarioOut = {
  id: 4,
  business_id: 1,
  name: "Raise prices",
  parent_scenario_id: null,
  parent_scenario_name: null,
  created_at: "2026-01-01",
  decisions: [{ id: 1, type: "price", start_month: 3, value: 10, unit: "percent", extra: {}, source: "user", confirmed: true }],
};

describe("coach idea -> scenario builder", () => {
  it("never pre-confirms an AI idea's decisions and marks them as AI-sourced", () => {
    const form = ideaDecisionToForm(idea.decisions[0]);
    expect(form.confirmed).toBe(false);
    expect(form.source).toBe("ai");
  });

  it("converts ratios to the percentages the form uses", () => {
    const form = ideaDecisionToForm({
      type: "investment", start_month: 2, value: 5000, unit: "amount", loan_months: 24, annual_rate: 0.06,
    });
    expect(form.annual_rate).toBe(6);
    expect(form.loan_months).toBe(24);
  });

  it("puts the parent's decisions first, all unconfirmed, and names the new scenario after both", () => {
    const prefill = buildIdeaPrefill(idea, parent);
    expect(prefill.name).toBe("Raise prices + Add one more barista");
    expect(prefill.parentScenarioId).toBe(4);
    expect(prefill.decisions.map((d) => d.type)).toEqual(["price", "hiring"]);
    expect(prefill.decisions.every((d) => !d.confirmed)).toBe(true);
  });

  it("starts from nothing when the idea builds on 'if you change nothing'", () => {
    const prefill = buildIdeaPrefill({ ...idea, builds_on: "baseline", builds_on_scenario_id: null }, null);
    expect(prefill.name).toBe("Add one more barista");
    expect(prefill.parentScenarioId).toBeUndefined();
    expect(prefill.decisions).toHaveLength(1);
  });
});
