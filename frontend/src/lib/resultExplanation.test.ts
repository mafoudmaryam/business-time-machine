import { describe, expect, it } from "vitest";
import type { ExplanationContext } from "../api";
import { makeRun, makeSketch } from "../test-fixtures";
import { explainRun, explainSketch } from "./resultExplanation";

export const context = (over: Partial<ExplanationContext> = {}): ExplanationContext => ({
  version: 1, currency: "EUR", month_labels: ["November 2026", "December 2026", "January 2027"],
  decisions: [{ type: "price", value: 5, unit: "percent", start_month: 3, extra: {} }],
  central: { total: 1000, drivers: { price: 2000, visits: -1000 } }, ...over,
});

describe("result explanation evidence", () => {
  it("names the exact action and date, uses paired monthly profit for sketches and reports the downside", () => {
    const result = explainSketch(makeSketch({ explanation_context: context(), start_month: 3 }), "EUR");
    expect(result.actions).toEqual(["Raise prices 5% from January 2027 (month 3)"]);
    expect(result.outcome).toContain("€534.29 more");
    expect(result.outcome).toContain("averaged over all 12 months");
    expect(result.why).toContain("Higher takings per purchase".toLowerCase());
    expect(result.tradeoff).not.toContain("Fewer visits reduce sales");
    expect(result.tradeoff).toContain("382 fewer visits per month");
    expect(result.check).toContain("accept this price");
  });

  it.each([100, -100, 0])("describes positive, negative and unchanged monthly outcomes (%s)", delta => {
    const result = explainSketch(makeSketch({ extra_profit_per_month: delta, explanation_context: context({ central: { total: delta, drivers: { staff: delta } } }) }), "USD");
    expect(result.outcome).toContain(delta > 0 ? "€100.00 more" : delta < 0 ? "€100.00 less" : "no difference in money left after bills");
    if (delta < 0) expect(result.why).toContain("higher staff costs leave less money");
    expect(result.why).not.toMatch(/best|success|good idea/);
  });

  it("does not assign a central-run cause when its direction disagrees with the simulated result", () => {
    const result = explainSketch(makeSketch({ explanation_context: context({ central: { total: -900, drivers: { visits: -900 } } }) }), "USD");
    expect(result.why).toContain("different directions");
    expect(result.why).not.toContain("largest contribution");
  });

  it("does not invent causes when a matching driver is missing", () => {
    expect(explainSketch(makeSketch({ explanation_context: context({ central: { total: 900, drivers: { unknown: 900 } } }) }), "USD").why).toContain("not enough available evidence");
  });

  it("keeps zero, negative and mixed customer/cash outcomes honest without ranking choices", () => {
    const run = makeRun();
    run.results[1].summary.explanation_context = context();
    const text = explainRun(run, run.results[1].scenario_name, "USD")!;
    expect(text.outcome).toContain("€15,800.00 more");
    expect(text.outcome).toContain("over 12 months in total");
    expect(text.tradeoff).toContain("39 fewer regular customers at month 12");
    run.results[1].summary.end_cash_p50 = 80000;
    expect(explainRun(run, run.results[1].scenario_name, "USD")!.tradeoff).toContain("€10,000 less cash");
  });

  it("uses the selected scenario only and its actual horizon", () => {
    const run = makeRun({ horizon: 36 });
    const other = structuredClone(run.results[1]); other.scenario_name = "Another plan";
    other.summary.total_profit_p50 = 60000; other.summary.explanation_context = context({ central: { total: -7, drivers: { staff: -7 } } });
    run.results.push(other);
    expect(explainRun(run, "Another plan", "USD")!.outcome).toContain("€7,000.00 less after bills over 36 months in total");
    expect(explainRun(run, "missing", "USD")).toBeNull();
    expect(explainRun(run, "baseline", "USD")).toBeNull();
  });

  it("treats historical names as unverified and keeps limitations visible", () => {
    const run = makeRun(); const text = explainRun(run, run.results[1].scenario_name, "USD")!;
    expect(text.actions[0]).toContain("did not save the original action amounts and start dates");
    expect(text.why).toContain("not enough available evidence");
    expect(text.marketing).toBe(true);
  });

  it("preserves cents, multiple actions and financing without cafe-specific words", () => {
    const text = explainSketch(makeSketch({ explanation_context: context({ decisions: [
      { type: "price", unit: "absolute", value: 6.5, start_month: 1, extra: {} },
      { type: "investment", unit: "absolute", value: 500, start_month: 3, extra: { loan_months: 12, annual_rate: .06, capacity_pct: 10 } },
    ] }) }), "EUR");
    expect(text.actions[0]).toContain("€6.50");
    expect(text.actions[1]).toContain("financed over 12 months at 6% annual interest");
    expect(JSON.stringify(text)).not.toMatch(/café|barista/);
  });

  it("warns about unvalidated marketing and asks about capacity", () => {
    const run = makeRun(); run.results[1].summary.explanation_context = context({ decisions: [{ type: "marketing", unit: "absolute", value: 800, start_month: 1, extra: {} }] });
    const text = explainRun(run, run.results[1].scenario_name, "USD")!;
    expect(text.marketing).toBe(true); expect(text.check).toContain("could you serve them");
    expect(text.actions[0]).toContain("€800/month");
  });
  it("keeps investment payments in the cash trade-off rather than the profit reason", () => {
    const text = explainSketch(makeSketch({ extra_profit_per_month: 0, explanation_context: context({ central: { total: 0, drivers: {} }, cash_effect: -1000 }) }), "EUR");
    expect(text.why).toContain("rounds to zero");
    expect(text.tradeoff).toContain("not deducted from the profit figure");
  });

});
