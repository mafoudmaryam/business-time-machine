import { describe, expect, it } from "vitest";
import { makeSketch } from "../test-fixtures";
import {
  catchText, dots, exampleText, futuresText, keepText, lowestCashSentence, monthCard, monthValueText, parseTimelineQuery, pickStart,
  priceNote, scenarioName, timelineLink, timelineRows,
} from "./sketch";

describe("priceNote (plain rules on the slider, never AI)", () => {
  it("tiny rises (under 4%) are low risk and small gain", () => {
    for (const p of [1, 2, 3, 3.9]) expect(priceNote(p)).toBe("Low risk, but the gain is small too.");
  });
  it("small rises (4 to 10%) are often noticed less than owners fear", () => {
    for (const p of [4, 7, 10]) expect(priceNote(p)).toBe("Small rises are often noticed less than owners fear.");
  });
  it("a big jump (over 10%) warns that regulars may drift away", () => {
    for (const p of [10.5, 11, 15]) {
      expect(priceNote(p)).toBe("That is a big jump. More of your regulars may drift away, so the gain is less certain.");
    }
  });
});

describe("right-hand card", () => {
  it("keepText: a gain reads +$X more, and the two figures add up", () => {
    const k = keepText(makeSketch(), "USD");
    expect(k.amount).toBe("+$534");
    expect(k.direction).toBe("more");
    expect(k.detail).toBe("That is $6,096 a month, instead of $5,562.");
  });

  it("keepText: a loss reads -$X less", () => {
    const k = keepText(makeSketch({ extra_profit_per_month: -120.4, profit_per_month_with_change: 5441, profit_per_month_without: 5561 }), "USD");
    expect(k.amount).toBe("-$120");
    expect(k.direction).toBe("less");
  });

  it("keepText: a tiny change rounds to +$0 'more', not a sign flip", () => {
    expect(keepText(makeSketch({ extra_profit_per_month: 0.3 }), "USD").amount).toBe("+$0");
    expect(keepText(makeSketch({ extra_profit_per_month: -0.3 }), "USD").direction).toBe("more");
  });

  it("uses the business currency", () => {
    expect(keepText(makeSketch(), "EUR").amount).toContain("€");
  });

  it("catchText: fewer visits, in plain words", () => {
    expect(catchText(-382)).toBe("About 382 fewer visits a month, because some people will come less often.");
    expect(catchText(-1234.4)).toContain("About 1,234 fewer visits");
  });

  it("catchText: almost nothing, and more visits", () => {
    expect(catchText(-0.2)).toBe("Almost no change in visits.");
    expect(catchText(0)).toBe("Almost no change in visits.");
    expect(catchText(90)).toBe("About 90 more visits a month.");
  });

  it("futuresText and dots agree", () => {
    expect(futuresText(9)).toBe("You come out ahead in 9 of 10 possible futures.");
    const d = dots(9);
    expect(d).toHaveLength(10);
    expect(d.filter(Boolean)).toHaveLength(9);
    expect(d[8]).toBe(true);
    expect(d[9]).toBe(false);
  });

  it("dots never go outside 0-10", () => {
    expect(dots(0).filter(Boolean)).toHaveLength(0);
    expect(dots(10).filter(Boolean)).toHaveLength(10);
    expect(dots(14).filter(Boolean)).toHaveLength(10);
    expect(dots(-3).filter(Boolean)).toHaveLength(0);
  });

  it("exampleText uses the engine's own before/after, in cents", () => {
    expect(exampleText({ before: 6.5, after: 6.96 }, "USD")).toBe("A typical $6.50 visit would cost $6.96.");
    expect(exampleText(null, "USD")).toBeNull();
  });
});

describe("start buttons and saving", () => {
  const options = [
    { key: "next", label: "Next month", month: 1, name: "November 2026" },
    { key: "in3", label: "In 3 months", month: 3, name: "January 2027" },
    { key: "spring", label: "In spring", month: 5, name: "March 2027" },
  ];
  it("finds the button for a month", () => {
    expect(pickStart(options, 3)?.key).toBe("in3");
    expect(pickStart(options, 9)).toBeUndefined();
  });

  it("names a scenario from the sentence, without the month number", () => {
    expect(scenarioName(makeSketch())).toBe("Raise prices by 7% from November 2026");
  });
});

describe("the 12-month page", () => {
  it("round-trips the address", () => {
    const link = timelineLink({ type: "price", amount: 7, start: 3 });
    expect(link).toBe("/timeline?change=price&amount=7&start=3");
    expect(parseTimelineQuery(new URLSearchParams(link.split("?")[1]))).toEqual({ type: "price", amount: 7, start: 3 });
  });

  it("falls back to a modest rise starting next month if the address is missing or silly", () => {
    expect(parseTimelineQuery(new URLSearchParams(""))).toEqual({ type: "price", amount: 7, start: 1 });
    expect(parseTimelineQuery(new URLSearchParams("change=evil&amount=abc&start=99"))).toEqual({ type: "price", amount: 7, start: 1 });
    expect(parseTimelineQuery(new URLSearchParams("amount=&start=2.5"))).toEqual({ type: "price", amount: 7, start: 1 });
  });

  it("keeps a real amount of 0 or a negative one", () => {
    expect(parseTimelineQuery(new URLSearchParams("amount=0")).amount).toBe(0);
    expect(parseTimelineQuery(new URLSearchParams("amount=-5&change=price")).amount).toBe(-5);
  });

  it("month text for the slider", () => {
    expect(monthValueText(3, "Jan 2027")).toBe("Month 3, Jan 2027");
  });

  it("lowest cash sentence in plain words", () => {
    const s = makeSketch();
    const path = { ...s.change, lowest_cash_amount: 12000, lowest_cash_month: 5 };
    expect(lowestCashSentence(path, s.month_labels, 25000, "USD")).toBe("Your lowest cash point is $12,000, in Mar 2027.");
  });

  it("says when cash never drops below today, and when it goes below zero", () => {
    const s = makeSketch();
    expect(lowestCashSentence({ ...s.change, lowest_cash_amount: 31000, lowest_cash_month: 1 }, s.month_labels, 25000, "USD")).toBe(
      "Your lowest cash point is $31,000, in Nov 2026. That is no lower than what you have in the bank today.",
    );
    expect(lowestCashSentence({ ...s.change, lowest_cash_amount: -500, lowest_cash_month: 7 }, s.month_labels, 25000, "USD")).toContain("below zero");
  });

  it("monthCard picks the right month, with and without the change", () => {
    const s = makeSketch();
    const c = monthCard(s, 3);
    expect(c.profit).toBe(s.change.profit.p50[2]);
    expect(c.profitBaseline).toBe(s.baseline.profit.p50[2]);
    expect(c.cash).toBe(s.change.cash.p50[2]);
    expect(monthCard(s, 99).profit).toBe(s.change.profit.p50[11]);
    expect(monthCard(s, 0).profit).toBe(s.change.profit.p50[0]);
  });

  it("timelineRows line months up with the band and the baseline", () => {
    const s = makeSketch();
    const rows = timelineRows(s, "profit");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ label: "Nov 2026", p50: 6100, range: [4900, 7300], baseline: 5560 });
  });
});
