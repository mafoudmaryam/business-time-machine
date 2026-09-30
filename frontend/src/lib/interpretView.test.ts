import { describe, expect, it } from "vitest";
import type { DecisionFormValues, Interpretation, InterpretedDecision } from "../api";
import {
  applyEdit,
  groupSteps,
  interpretedToForm,
  monthOneLabel,
  MONTH_HINT,
  pairSentence,
  reverseOf,
  stepSentence,
  stepsFromInterpretation,
  suggestName,
} from "./interpretView";

const hire: InterpretedDecision = {
  type: "hiring", start_month: 9, value: 1, unit: "fte", source_quote: "hire a baker for the summer",
  sentence: "Hire 1 baker, June → August 2027 (months 9–11)", when_label: "June → August 2027 (months 9–11)",
  group: "g1", role: "start", group_sentence: "Hire 1 baker, June → August 2027 (months 9–11)",
};
const back: InterpretedDecision = { ...hire, start_month: 12, value: -1, sentence: "Back to normal from September 2027 (month 12)", role: "end" };
const price: InterpretedDecision = {
  type: "price", start_month: 6, value: 10, unit: "percent", source_quote: "Raise prices 10% in March",
  sentence: "Raise prices 10%, from March 2027 (month 6)", when_label: "March 2027 (month 6)", group: null, role: null,
  group_sentence: null,
};
const result: Interpretation = {
  id: 7, business_id: 1, text: "x", status: "done", provider: null, fallback: null, decisions: [price, hire, back],
  questions: [], out_of_scope: null, notes: [], month_one: "",
};

describe("month one", () => {
  it("is the calendar month after today", () => {
    expect(monthOneLabel(new Date(2026, 8, 30))).toBe("October 2026");
    expect(monthOneLabel(new Date(2026, 11, 15))).toBe("January 2027");
    expect(MONTH_HINT(new Date(2026, 8, 30))).toBe(
      "Month 1 is October 2026, the month after this one. “Summer” means June to August.",
    );
  });
});

describe("suggestName", () => {
  it("uses the owner's words, tidily", () => {
    expect(suggestName("  raise prices 10% in March. ")).toBe("Raise prices 10% in March");
    expect(suggestName("")).toBe("");
    expect(suggestName("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe("interpretedToForm", () => {
  it("is never confirmed, comes from the AI, and keeps where it came from", () => {
    const step = interpretedToForm(price, 7);
    expect(step).toMatchObject({ type: "price", start_month: 6, value: 10, source: "ai", confirmed: false });
    expect(step.origin).toMatchObject({ interpretationId: 7, quote: "Raise prices 10% in March", group: null });
  });

  it("turns ratios into the percentages the form shows", () => {
    const step = interpretedToForm(
      { ...price, type: "investment", unit: "amount", value: 8000, loan_months: 24, annual_rate: 0.06 },
      1,
    );
    expect(step).toMatchObject({ loan_months: 24, annual_rate: 6 });
  });

  it("every step of a reading arrives unticked", () => {
    expect(stepsFromInterpretation(result).every((s) => !s.confirmed)).toBe(true);
  });
});

describe("groupSteps", () => {
  it("shows a start and its end as ONE item", () => {
    const items = groupSteps(stepsFromInterpretation(result));
    expect(items.map((i) => i.kind)).toEqual(["single", "pair"]);
    expect(items[1]).toMatchObject({ kind: "pair", index: 1, endIndex: 2 });
  });

  it("leaves a start without an end alone", () => {
    const steps = stepsFromInterpretation(result).slice(0, 2);
    expect(groupSteps(steps).map((i) => i.kind)).toEqual(["single", "single"]);
  });
});

describe("reverseOf", () => {
  const base: DecisionFormValues = { type: "hiring", start_month: 9, value: 2, unit: "fte", source: "ai", confirmed: false };

  it("undoes hiring and percentage changes exactly", () => {
    expect(reverseOf(base, 12)).toMatchObject({ type: "hiring", start_month: 12, value: -2 });
    const up = reverseOf({ ...base, type: "price", unit: "percent", value: 10 }, 12)!;
    expect((1 + 10 / 100) * (1 + up.value / 100)).toBeCloseTo(1, 6);
  });

  it("cannot undo hours, absolute amounts or investments", () => {
    expect(reverseOf({ ...base, type: "hours", unit: "days", value: 30 }, 12)).toBeNull();
    expect(reverseOf({ ...base, type: "marketing", unit: "per_month", value: 900 }, 12)).toBeNull();
    expect(reverseOf({ ...base, type: "investment", unit: "amount", value: 8000 }, 12)).toBeNull();
  });
});

describe("sentences", () => {
  const steps = stepsFromInterpretation(result);

  it("uses the app's own sentence until the owner edits the step", () => {
    expect(stepSentence(steps[0], "baker", "USD")).toBe("Raise prices 10%, from March 2027 (month 6)");
    expect(stepSentence({ ...steps[0], edited: true, value: 12 }, "baker", "USD")).toBe("Raise prices 12% from month 6");
  });

  it("shows a temporary change as one sentence, then in the form's words once edited", () => {
    expect(pairSentence(steps[1], steps[2], "baker", "USD")).toBe("Hire 1 baker, June → August 2027 (months 9–11)");
    expect(pairSentence({ ...steps[1], edited: true }, steps[2], "baker", "USD")).toBe(
      "Hire 1 baker from month 9, then back to normal from month 12",
    );
  });
});

describe("applyEdit", () => {
  const steps = stepsFromInterpretation(result);
  const pair = groupSteps(steps)[1];

  it("editing a single step replaces it and, because saving an edit means reviewing it, confirms it as 'edited'", () => {
    const unticked = steps.map((s) => ({ ...s, confirmed: false }));
    const item = groupSteps(unticked)[0];
    const next = applyEdit(unticked, item, { ...unticked[0], value: 15 }, null);
    expect(next[0]).toMatchObject({ value: 15, edited: true, confirmed: true, confirmedVia: "edited" });
    expect(next[1].confirmed).toBe(false); // other steps are untouched
  });

  it("editing a temporary change rebuilds its end from the new start and end month", () => {
    const next = applyEdit(steps, pair, { ...steps[1], value: 2 }, 11);
    expect(next).toHaveLength(3);
    expect(next[1]).toMatchObject({ value: 2, edited: true });
    expect(next[1]).toMatchObject({ confirmed: true, confirmedVia: "edited" });
    expect(next[2]).toMatchObject({ start_month: 11, value: -2, unit: "fte", confirmed: true, confirmedVia: "edited" });
    expect(next[2].origin?.group).toBe("g1");
  });

  it("an empty end month makes it permanent and drops the reversing step", () => {
    const next = applyEdit(steps, pair, steps[1], null);
    expect(next).toHaveLength(2);
    expect(next[1].origin).toMatchObject({ group: null, role: null });
  });

  it("changing a temporary change into something that cannot be undone makes it permanent", () => {
    const next = applyEdit(steps, pair, { ...steps[1], type: "hours", unit: "days", value: 30 }, 12);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ type: "hours" });
  });
});
