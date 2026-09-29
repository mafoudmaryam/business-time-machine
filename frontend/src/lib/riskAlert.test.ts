import { describe, expect, it } from "vitest";
import { futuresPhrase, riskAlert } from "./riskAlert";

describe("riskAlert", () => {
  it("returns null when the engine's prob_cash_negative is below 10%", () => {
    expect(riskAlert({ prob_cash_negative: 0.09, first_month_cash_risk_10pct: 5 })).toBeNull();
  });

  it("returns null when there is no cash risk at all", () => {
    expect(riskAlert({ prob_cash_negative: 0, first_month_cash_risk_10pct: null })).toBeNull();
  });

  it("words the month and the risk in tenths, straight from the engine summary", () => {
    expect(riskAlert({ prob_cash_negative: 0.30, first_month_cash_risk_10pct: 8 }))
      .toBe("Cash may run out around month 8 (in 3 of 10 futures).");
  });

  it("rounds to whole tenths", () => {
    expect(riskAlert({ prob_cash_negative: 0.1234, first_month_cash_risk_10pct: 3 }))
      .toBe("Cash may run out around month 3 (in 1 of 10 futures).");
  });

  it("falls back to a monthless message when first_month_cash_risk_10pct is null", () => {
    expect(riskAlert({ prob_cash_negative: 0.5, first_month_cash_risk_10pct: null }))
      .toBe("Cash may run out at some point (in 5 of 10 futures).");
  });

  it("never recomputes -- it trusts prob_cash_negative even if it seems to disagree with the month", () => {
    // first_month_cash_risk_10pct uses a different per-month threshold than
    // prob_cash_negative (ever negative); riskAlert must not reconcile them.
    expect(riskAlert({ prob_cash_negative: 0.11, first_month_cash_risk_10pct: 1 }))
      .toBe("Cash may run out around month 1 (in 1 of 10 futures).");
  });

  it("says 10 of 10 only when the engine says 100%, and never mentions a percentage chance", () => {
    expect(riskAlert({ prob_cash_negative: 1, first_month_cash_risk_10pct: 4 }))
      .toBe("Cash may run out around month 4 (in 10 of 10 futures).");
    expect(riskAlert({ prob_cash_negative: 0.97, first_month_cash_risk_10pct: 4 })).toContain("in 9 of 10 futures");
    expect(riskAlert({ prob_cash_negative: 1, first_month_cash_risk_10pct: 4 })).not.toMatch(/%|chance/);
  });

  it("futuresPhrase stays between 1 and 10 of 10", () => {
    expect(futuresPhrase(0.1)).toBe("in 1 of 10 futures");
    expect(futuresPhrase(0.5)).toBe("in 5 of 10 futures");
    expect(futuresPhrase(1)).toBe("in 10 of 10 futures");
  });
});
