import { describe, expect, it } from "vitest";
import { CASH_ASSUMPTION, CHURN_ASSUMPTION, makeToday } from "../test-fixtures";
import {
  apiValue,
  chartRows,
  defaultBusinessName,
  entryValue,
  formatAssumptionValue,
  industryWord,
  lowestCashTile,
  noteIsPending,
  profitTile,
  safetyTile,
  toAnswers,
  validateAnswers,
  validateAssumption,
  type AnswerDraft,
} from "./todayView";

const GOOD: AnswerDraft = { customers_per_day: 150, avg_spend: 7.5, monthly_rent: 3000, staff: 4 };

describe("validateAnswers", () => {
  it("accepts sensible answers", () => {
    expect(validateAnswers(GOOD)).toEqual({});
  });

  it("asks for a number when a field is empty (NaN), instead of forcing a 0", () => {
    const errors = validateAnswers({ customers_per_day: NaN, avg_spend: NaN, monthly_rent: NaN, staff: NaN });
    expect(Object.keys(errors).sort()).toEqual(["avg_spend", "customers_per_day", "monthly_rent", "staff"]);
    expect(errors.customers_per_day).toBe("Enter a number.");
  });

  it("allows no rent but not negative rent", () => {
    expect(validateAnswers({ ...GOOD, monthly_rent: 0 })).toEqual({});
    expect(validateAnswers({ ...GOOD, monthly_rent: -1 }).monthly_rent).toBeTruthy();
  });

  it("needs at least one person, and a positive spend and customer count", () => {
    expect(validateAnswers({ ...GOOD, staff: 0 }).staff).toContain("at least one");
    expect(validateAnswers({ ...GOOD, avg_spend: 0 }).avg_spend).toBeTruthy();
    expect(validateAnswers({ ...GOOD, customers_per_day: -2 }).customers_per_day).toBeTruthy();
  });

  it("catches silly sizes", () => {
    expect(validateAnswers({ ...GOOD, customers_per_day: 1e6 }).customers_per_day).toContain("too big");
    expect(validateAnswers({ ...GOOD, staff: 5000 }).staff).toContain("too big");
  });

  it("the cleaned answers have exactly the four API fields", () => {
    expect(toAnswers(GOOD)).toEqual({ customers_per_day: 150, avg_spend: 7.5, monthly_rent: 3000, staff: 4 });
  });
});

describe("names and words", () => {
  it("gives each industry a friendly default name", () => {
    expect(defaultBusinessName("cafe")).toBe("My café");
    expect(defaultBusinessName("bakery")).toBe("My bakery");
    expect(defaultBusinessName("zoo")).toBe("My business");
  });

  it("writes the industry with its accent", () => {
    expect(industryWord("cafe")).toBe("café");
    expect(industryWord("restaurant")).toBe("restaurant");
  });
});

describe("tiles", () => {
  const t = makeToday().tiles;

  it("profit tile for a profit", () => {
    const tile = profitTile(t, "USD");
    expect(tile.headline).toBe("$5,820");
    expect(tile.tone).toBe("good");
    expect(tile.risk).toBeNull();
    expect(tile.detail).toContain("You keep about this");
    expect(tile.detail).toContain("keep $4,330");
    expect(tile.detail).toContain("keep $7,260");
  });

  it("profit tile for a loss says lose and warns", () => {
    const tile = profitTile({ ...t, profit_a_month: -900, profit_a_month_bad_case: -2000, profit_a_month_good_case: 100 }, "USD");
    expect(tile.headline).toBe("$900");
    expect(tile.tone).toBe("bad");
    expect(tile.detail).toContain("You lose about this");
    expect(tile.detail).toContain("lose $2,000");
    expect(tile.detail).toContain("keep $100");
    expect(tile.risk).toContain("loss");
  });

  it("uses the business's currency", () => {
    expect(profitTile(t, "EUR").headline).toContain("€");
  });

  it("safety tile: months of bills in plain words, risk only when it is real", () => {
    expect(safetyTile(t, "USD").detail).toContain("covers about 2 months");
    expect(safetyTile(t, "USD").risk).toBeNull();
    expect(safetyTile({ ...t, months_of_bills_covered: 1 }, "USD").detail).toContain("about 1 month of bills");
    expect(safetyTile({ ...t, months_of_bills_covered: 0 }, "USD").detail).toContain("less than one month");
    const risky = safetyTile({ ...t, cash_runs_out_of_10: 3 }, "USD");
    expect(risky.risk).toBe("Cash runs out in 3 of 10 possible futures.");
    expect(risky.tone).toBe("bad");
  });

  it("lowest cash tile: a growing business never dips below today", () => {
    const tile = lowestCashTile(t, "USD");
    expect(tile.headline).toBe("$51,400");
    expect(tile.detail).toContain("does not drop below what you have today");
  });

  it("lowest cash tile: a real dip names the month", () => {
    const tile = lowestCashTile({ ...t, lowest_cash_amount: 12000, lowest_cash_month: 5, lowest_cash_month_label: "Mar 2027" }, "USD");
    expect(tile.headline).toBe("$12,000");
    expect(tile.detail).toBe("Around Mar 2027, if you change nothing.");
    expect(tile.risk).toBeNull();
  });

  it("lowest cash tile: below zero is flagged", () => {
    const tile = lowestCashTile({ ...t, lowest_cash_amount: -500, lowest_cash_month: 7, lowest_cash_month_label: "May 2027" }, "USD");
    expect(tile.risk).toBe("That is below zero.");
    expect(tile.tone).toBe("bad");
  });

  it("no tile uses business jargon", () => {
    const all = [profitTile(t, "USD"), safetyTile(t, "USD"), lowestCashTile(t, "USD")]
      .flatMap((x) => [x.title, x.help, x.detail, x.risk ?? ""])
      .join(" ");
    for (const word of ["FTE", "COGS", "churn", "baseline", "p10", "p50", "p90"]) expect(all).not.toContain(word);
  });
});

describe("chartRows", () => {
  it("lines up months with the bad case, most likely and good case", () => {
    const today = makeToday();
    const rows = chartRows(today, "profit");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ label: "Nov 2026", p10: 4400, p50: 5800, p90: 7200, range: [4400, 7200] });
    expect(chartRows(today, "cash")[11].p50).toBe(57000 + 11 * 5800);
  });
});

describe("assumptions", () => {
  it("formats each kind of value", () => {
    expect(formatAssumptionValue(CASH_ASSUMPTION, "USD")).toBe("$51,400");
    expect(formatAssumptionValue(CHURN_ASSUMPTION, "USD")).toBe("5%");
    expect(formatAssumptionValue({ ...CASH_ASSUMPTION, unit: "count", value: 4 }, "USD")).toBe("4");
    expect(formatAssumptionValue({ ...CASH_ASSUMPTION, unit: "days", value: 28 }, "USD")).toBe("28 days");
    expect(formatAssumptionValue({ ...CASH_ASSUMPTION, unit: "number", value: 6.04 }, "USD")).toBe("6");
  });

  it("percent fields are typed as 0-100 and sent as 0-1", () => {
    expect(entryValue(CHURN_ASSUMPTION)).toBe(5);
    expect(apiValue(CHURN_ASSUMPTION, 8)).toBeCloseTo(0.08, 10);
    expect(entryValue(CASH_ASSUMPTION)).toBe(51400);
    expect(apiValue(CASH_ASSUMPTION, 40000)).toBe(40000);
  });

  it("validates what the owner types", () => {
    expect(validateAssumption(CASH_ASSUMPTION, NaN)).toBe("Enter a number.");
    expect(validateAssumption(CASH_ASSUMPTION, -5)).toBe("Can't be negative.");
    expect(validateAssumption(CASH_ASSUMPTION, 0)).toBeNull();
    expect(validateAssumption(CHURN_ASSUMPTION, 100)).toBe("Must be less than 100.");
    expect(validateAssumption({ ...CASH_ASSUMPTION, field: "open_days", unit: "days" }, 40)).toBe("Between 1 and 31 days.");
    expect(validateAssumption({ ...CASH_ASSUMPTION, field: "staff_fte", unit: "count" }, 0)).toBe("Must be more than 0.");
  });
});

describe("noteIsPending", () => {
  it("is true only while the AI is still writing", () => {
    const note = makeToday().note!;
    expect(noteIsPending(null)).toBe(false);
    expect(noteIsPending(note)).toBe(false);
    expect(noteIsPending({ ...note, ai_status: "pending" })).toBe(true);
    expect(noteIsPending({ ...note, ai_status: "done" })).toBe(false);
  });
});
