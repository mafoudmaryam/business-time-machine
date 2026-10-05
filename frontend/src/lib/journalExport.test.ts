import { describe, expect, it } from "vitest";
import { chartGeometry, journalCsv, journalSummary, parseAmount } from "./journalView";
import { makeJournalMonth } from "../test-fixtures";

describe("typing amounts", () => {
  it.each([
    ["5200", 5200], ["5,200", 5200], ["$5200", 5200], ["$5,200.50", 5200.5], ["-400", -400], ["-$400", -400],
    ["−400", -400], ["  1,234,567 ", 1234567], ["5.", 5], [".5", 0.5], ["0", 0],
  ])("reads %s as %s", (text, value) => expect(parseAmount(text)).toBe(value));

  it.each(["", "abc", "5,2", "5,20", "12,34,567", "1e3", "5 200 x", "--5", "$", "-", "5.2.1"])("does not guess at '%s'", (text) => {
    expect(parseAmount(text)).toBeNaN();
  });
});

describe("the summary", () => {
  const month = (position: "inside" | "above" | "below", key = "2026-11") => {
    const m = makeJournalMonth({ month: key });
    m.comparisons[0] = { ...m.comparisons[0], position };
    return m;
  };
  const uncompared = () => makeJournalMonth({ has_prediction: false, comparisons: [] });

  it("is empty with nothing recorded", () => expect(journalSummary([])).toBe(""));

  it("says plainly when none could be compared", () => {
    expect(journalSummary([uncompared()])).toBe("You have recorded 1 month. We had not made a forecast for it yet, so there is nothing to compare.");
  });

  it("counts the months inside the range and stays humble when there are only a few", () => {
    expect(journalSummary([month("inside"), month("above", "2026-12")])).toBe(
      "You have recorded 2 months. 1 of 2 months we could compare landed inside our range. A few months can't tell us much yet.",
    );
  });

  it("says so when the forecasts are often off", () => {
    const text = journalSummary([month("below"), month("above", "2026-12"), month("inside", "2027-01")]);
    expect(text).toMatch(/1 of 3 months we could compare landed inside our range\./);
    expect(text).toMatch(/forecasts were often off/);
  });

  it("does not boast when they are mostly right", () => {
    const text = journalSummary([month("inside"), month("inside", "2026-12"), month("inside", "2027-01")]);
    expect(text).toMatch(/3 of 3 months/);
    expect(text).toMatch(/doesn't prove much either way/);
    expect(text).not.toMatch(/often off/);
  });
});

describe("the download", () => {
  const lines = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

  it("has the columns in order, one row per month per figure, oldest month first", () => {
    const rows = lines(journalCsv([makeJournalMonth({ month: "2026-12" }), makeJournalMonth({ month: "2026-11" })]));
    expect(rows[0]).toBe("month,figure,predicted_p10,predicted_p50,predicted_p90,actual,difference,status,note");
    expect(rows).toHaveLength(7);
    expect(rows[1]).toBe("2026-11,profit,4800,6000,7300,5900,-100,inside the range we showed,");
    expect(rows[2]).toBe("2026-11,cash in the bank,53000,57000,61000,52000,-5000,below the range,");
    expect(rows[3]).toBe("2026-11,customer visits,3800,4000,4200,4300,300,better than the range,");
    expect(rows[4].startsWith("2026-12,profit")).toBe(true);
  });

  it("starts with a byte-order mark so a spreadsheet reads it as UTF-8", () => {
    expect(journalCsv([makeJournalMonth()]).charCodeAt(0)).toBe(0xfeff);
  });

  it("leaves the predicted columns empty and says 'not compared' for a month with no forecast", () => {
    const m = makeJournalMonth({ has_prediction: false, comparisons: [] });
    expect(lines(journalCsv([m]))[1]).toBe("2026-11,profit,,,,5900,,not compared,");
  });

  it("quotes notes with commas, quotes and line breaks", () => {
    const m = makeJournalMonth();
    m.entry.note = 'Road, "closed"\nfor a week';
    expect(journalCsv([m])).toContain('"Road, ""closed""\nfor a week"');
  });

  it("defuses a note that would be read as a spreadsheet formula", () => {
    const m = makeJournalMonth();
    m.entry.note = '=HYPERLINK("http://x")';
    expect(journalCsv([m])).toContain(`,"'=HYPERLINK(`);
    m.entry.note = "-1+1";
    expect(journalCsv([m])).toContain(",'-1+1");
  });

  it("has only the header when there is nothing", () => {
    expect(lines(journalCsv([]))).toHaveLength(1);
  });
});

describe("the chart geometry", () => {
  const months = [
    { month: "2026-11", month_label: "November 2026", p10: 100, p50: 200, p90: 300 },
    { month: "2026-12", month_label: "December 2026", p10: 100, p50: 200, p90: 300 },
    { month: "2027-01", month_label: "January 2027", p10: 100, p50: 200, p90: 300 },
  ];

  it("puts a dot only on the months that were written down", () => {
    const m = makeJournalMonth({ month: "2026-12" });
    m.entry.actual_profit = 250;
    const g = chartGeometry(months, [m]);
    expect(g.dots.map((d) => d.month)).toEqual(["2026-12"]);
    expect(g.dots[0].position).toBe("inside");
    expect(g.bandPath.startsWith("M")).toBe(true);
    expect(g.firstLabel).toBe("November 2026");
    expect(g.lastLabel).toBe("January 2027");
  });

  it("keeps a dot far outside the band on the drawing", () => {
    const m = makeJournalMonth({ month: "2026-11" });
    m.entry.actual_profit = -5000;
    const g = chartGeometry(months, [m]);
    expect(g.dots[0].y).toBeLessThanOrEqual(g.height);
    expect(g.dots[0].y).toBeGreaterThanOrEqual(0);
    expect(g.bottom).toBe(-5000);
  });

  it("draws higher profit higher up", () => {
    const hi = makeJournalMonth({ month: "2026-11" });
    hi.entry.actual_profit = 290;
    const lo = makeJournalMonth({ month: "2026-12" });
    lo.entry.actual_profit = 110;
    const g = chartGeometry(months, [hi, lo]);
    expect(g.dots[0].y).toBeLessThan(g.dots[1].y);
  });

  it("copes with no months", () => {
    const g = chartGeometry([], []);
    expect(g.bandPath).toBe("");
    expect(g.dots).toEqual([]);
  });
});
