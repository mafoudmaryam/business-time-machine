import { describe, expect, it } from "vitest";
import type { DecisionFormValues } from "../api";
import { decisionSummary } from "./decisionSummary";

function decision(overrides: Partial<DecisionFormValues>): DecisionFormValues {
  return {
    type: "price",
    start_month: 1,
    value: 0,
    unit: "percent",
    source: "user",
    confirmed: false,
    ...overrides,
  };
}

describe("decisionSummary", () => {
  it("summarizes a percent price rise", () => {
    expect(decisionSummary(decision({ type: "price", value: 10, unit: "percent", start_month: 3 })))
      .toBe("Raise prices 10% from month 3");
  });

  it("summarizes a percent price cut", () => {
    expect(decisionSummary(decision({ type: "price", value: -15, unit: "percent", start_month: 1 })))
      .toBe("Cut prices 15% from month 1");
  });

  it("summarizes an absolute price change in USD by default", () => {
    expect(decisionSummary(decision({ type: "price", value: 7.5, unit: "absolute", start_month: 2 })))
      .toBe("Set price to $7.50 from month 2");
  });

  it("formats money in the given currency, not a hard-coded one", () => {
    expect(decisionSummary(decision({ type: "price", value: 7.5, unit: "absolute", start_month: 2 }), undefined, "JPY"))
      .toBe("Set price to ¥8 from month 2");
  });

  it("summarizes hiring without a staff noun", () => {
    expect(decisionSummary(decision({ type: "hiring", value: 1.5, unit: "fte", start_month: 2 })))
      .toBe("Add 1.5 full-time staff from month 2");
  });

  it("summarizes layoffs as a cut", () => {
    expect(decisionSummary(decision({ type: "hiring", value: -1, unit: "fte", start_month: 4 })))
      .toBe("Cut 1 full-time staff from month 4");
  });

  it("uses the industry's staff noun when given, singular", () => {
    expect(decisionSummary(decision({ type: "hiring", value: 1, unit: "fte", start_month: 6 }), "baker"))
      .toBe("Hire 1 baker from month 6");
  });

  it("uses the industry's staff noun when given, pluralized", () => {
    expect(decisionSummary(decision({ type: "hiring", value: 2, unit: "fte", start_month: 6 }), "server"))
      .toBe("Hire 2 servers from month 6");
  });

  it("uses the industry's staff noun for layoffs too", () => {
    expect(decisionSummary(decision({ type: "hiring", value: -1.5, unit: "fte", start_month: 3 }), "barista"))
      .toBe("Let go of 1.5 baristas from month 3");
  });

  it("summarizes an absolute marketing budget", () => {
    expect(decisionSummary(decision({ type: "marketing", value: 600, unit: "per_month", start_month: 1 })))
      .toBe("Set marketing spend to $600/month from month 1");
  });

  it("summarizes a marketing percent increase", () => {
    expect(decisionSummary(decision({ type: "marketing", value: 20, unit: "percent", start_month: 1 })))
      .toBe("Increase marketing spend 20% from month 1");
  });

  it("summarizes opening hours", () => {
    expect(decisionSummary(decision({ type: "hours", value: 24, unit: "days", start_month: 1 })))
      .toBe("Open 24 days/month from month 1");
  });

  it("summarizes a plain menu change", () => {
    expect(decisionSummary(decision({ type: "menu", value: 8, unit: "percent", start_month: 1 })))
      .toBe("Change menu prices +8% from month 1");
  });

  it("summarizes a menu change with ingredient-cost and investment extras, in plain language", () => {
    expect(decisionSummary(decision({
      type: "menu", value: 8, unit: "percent", start_month: 1, cogs_ratio: 32, investment: 2000,
    }))).toBe("Change menu prices +8% from month 1, with ingredient costs set to 32% of sales and a $2,000 one-off setup cost");
  });

  it("summarizes a plain investment", () => {
    expect(decisionSummary(decision({ type: "investment", value: 12000, unit: "amount", start_month: 1 })))
      .toBe("Invest $12,000 from month 1");
  });

  it("summarizes a financed investment with capacity gain", () => {
    expect(decisionSummary(decision({
      type: "investment", value: 12000, unit: "amount", start_month: 1,
      loan_months: 24, annual_rate: 8, capacity_pct: 15,
    }))).toBe("Invest $12,000 from month 1, financed over 24 months at 8% annual interest, adding 15% capacity");
  });
});
