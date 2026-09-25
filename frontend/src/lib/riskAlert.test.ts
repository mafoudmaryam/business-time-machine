import { describe, expect, it } from "vitest";
import { riskAlert } from "./riskAlert";

describe("riskAlert", () => {
  it("returns null when the engine's prob_cash_negative is below 10%", () => {
    expect(riskAlert({ prob_cash_negative: 0.09, first_month_cash_risk_10pct: 5 })).toBeNull();
  });

  it("returns null when there is no cash risk at all", () => {
    expect(riskAlert({ prob_cash_negative: 0, first_month_cash_risk_10pct: null })).toBeNull();
  });

  it("formats the month and chance straight from the engine summary at exactly 10%", () => {
    expect(riskAlert({ prob_cash_negative: 0.30, first_month_cash_risk_10pct: 8 }))
      .toBe("Cash may run out around month 8 (30% chance).");
  });

  it("rounds the percentage to a whole number", () => {
    expect(riskAlert({ prob_cash_negative: 0.1234, first_month_cash_risk_10pct: 3 }))
      .toBe("Cash may run out around month 3 (12% chance).");
  });

  it("falls back to a monthless message when first_month_cash_risk_10pct is null", () => {
    expect(riskAlert({ prob_cash_negative: 0.5, first_month_cash_risk_10pct: null }))
      .toBe("Cash may run out at some point (50% chance).");
  });

  it("never recomputes -- it trusts prob_cash_negative even if it seems to disagree with the month", () => {
    // first_month_cash_risk_10pct uses a different per-month threshold than
    // prob_cash_negative (ever negative); riskAlert must not reconcile them.
    expect(riskAlert({ prob_cash_negative: 0.11, first_month_cash_risk_10pct: 1 }))
      .toBe("Cash may run out around month 1 (11% chance).");
  });
});
