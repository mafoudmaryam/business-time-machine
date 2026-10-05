import { describe, expect, it } from "vitest";
import { accuracySentence, monthKey, monthLabel, monthOptions, rangeBar, startingMonth, toEntryIn, validateEntry } from "./journalView";

describe("months", () => {
  it("writes keys and labels", () => {
    expect(monthKey(2026, 3)).toBe("2026-03");
    expect(monthLabel("2026-10")).toBe("October 2026");
  });

  it("offers this month and the eleven before it, newest first, across a year end", () => {
    const options = monthOptions(new Date(2027, 1, 14));
    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ value: "2027-02", label: "February 2027 (this month)" });
    expect(options[1].value).toBe("2027-01");
    expect(options[2].value).toBe("2026-12");
    expect(options[11].value).toBe("2026-03");
  });

  it("never offers a month that has not started", () => {
    const now = new Date(2026, 11, 10);
    expect(monthOptions(now).some((o) => o.value > "2026-12")).toBe(false);
  });

  it("starts on the first month we are waiting for, otherwise on last month", () => {
    const now = new Date(2026, 11, 10);
    expect(startingMonth([{ month: "2026-11", month_label: "November 2026" }], now)).toBe("2026-11");
    expect(startingMonth([], now)).toBe("2026-11");
    expect(startingMonth([], new Date(2027, 0, 5))).toBe("2026-12");
  });
});

describe("checking an entry", () => {
  const ok = { month: "2026-11", profit: 5000, cash: 20000, visits: 3000, note: "" };

  it("accepts good numbers, losses and negative cash", () => {
    expect(validateEntry(ok)).toEqual({});
    expect(validateEntry({ ...ok, profit: -400, cash: -50 })).toEqual({});
    expect(validateEntry({ ...ok, visits: 0 })).toEqual({});
  });

  it("asks for a number when a box is empty (never filling in a 0)", () => {
    const e = validateEntry({ ...ok, profit: NaN, cash: NaN, visits: NaN });
    expect(e.profit).toBe("Please enter a number.");
    expect(e.cash).toBe("Please enter a number.");
    expect(e.visits).toBe("Please enter a number.");
  });

  it("refuses negative visits and absurd sizes", () => {
    expect(validateEntry({ ...ok, visits: -1 }).visits).toMatch(/less than 0/);
    expect(validateEntry({ ...ok, profit: 1e13 }).profit).toMatch(/too big/);
    expect(validateEntry({ ...ok, month: "" }).month).toBeTruthy();
  });

  it("sends an empty note as nothing and trims a real one", () => {
    expect(toEntryIn(ok).note).toBeNull();
    expect(toEntryIn({ ...ok, note: "  holiday  " })).toEqual({
      month: "2026-11", actual_profit: 5000, actual_cash: 20000, actual_visits: 3000, note: "holiday",
    });
  });
});

describe("how the ranges did", () => {
  const base = { metric: "profit" as const, mean_difference: 0, mean_abs_percent_difference: 0 };

  it("says 'every time' when all months landed inside", () => {
    expect(accuracySentence({ ...base, months: 3, inside: 3, below: 0, above: 0 })).toBe("Over 3 months, your profit landed inside our range every time.");
    expect(accuracySentence({ ...base, months: 1, inside: 1, below: 0, above: 0 })).toMatch(/^Over 1 month,/);
  });

  it("otherwise counts where they landed", () => {
    expect(accuracySentence({ ...base, metric: "visits", months: 4, inside: 2, below: 1, above: 1 })).toBe(
      "Over 4 months, your customer visits landed 2 inside, 1 above, 1 below our range.",
    );
  });
});

describe("the range bar", () => {
  it("puts the pieces in order along the bar, inside 0-100", () => {
    const g = rangeBar({ actual: 5900, expected_low: 4800, expected: 6000, expected_high: 7300 });
    expect(g.low).toBeLessThan(g.actual);
    expect(g.actual).toBeLessThan(g.expected);
    expect(g.expected).toBeLessThan(g.high);
    for (const v of Object.values(g)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(100);
    }
  });

  it("still shows a figure far outside the range", () => {
    const below = rangeBar({ actual: -5000, expected_low: 4800, expected: 6000, expected_high: 7300 });
    expect(below.actual).toBeGreaterThanOrEqual(0);
    expect(below.actual).toBeLessThan(below.low);
    const above = rangeBar({ actual: 20000, expected_low: 4800, expected: 6000, expected_high: 7300 });
    expect(above.actual).toBeLessThanOrEqual(100);
    expect(above.actual).toBeGreaterThan(above.high);
  });

  it("copes with a range of zero width", () => {
    const g = rangeBar({ actual: 5, expected_low: 5, expected: 5, expected_high: 5 });
    expect(Object.values(g).every(Number.isFinite)).toBe(true);
  });
});
