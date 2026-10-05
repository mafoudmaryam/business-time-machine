import type { Assumption, TodayOut } from "./api";

const MONTHS = ["Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027", "Mar 2027", "Apr 2027", "May 2027", "Jun 2027", "Jul 2027", "Aug 2027", "Sep 2027", "Oct 2027"];

export function band(start: number, step: number, spread: number) {
  const p50 = MONTHS.map((_, i) => start + i * step);
  return { p10: p50.map((v) => v - spread), p50, p90: p50.map((v) => v + spread) };
}

export const CASH_ASSUMPTION: Assumption = {
  field: "cash", label: "Cash in the bank", value: 51400, unit: "money", rule: "two months of your monthly costs", important: true,
};
export const RENT_ASSUMPTION: Assumption = {
  field: "fixed_costs", label: "Rent and other fixed bills each month", value: 4000, unit: "money",
  rule: "your rent plus a rough rule: one third of the rent again for utilities, insurance and other bills", important: true,
};
export const CHURN_ASSUMPTION: Assumption = {
  field: "churn_rate", label: "Regulars who stop coming each month", value: 0.05, unit: "percent",
  rule: "typical share of regulars who stop coming each month at a small café", important: false,
};

/** A realistic Today response (a healthy café). Override any part. */
export function makeToday(over: Partial<TodayOut> = {}): TodayOut {
  return {
    business_id: 1, name: "My café", industry: "cafe", currency: "USD", is_sample: false, run_id: 10, horizon: 12,
    engine_version: "1", seed: 1001, iterations: 1000, month_labels: MONTHS,
    tiles: {
      profit_a_month: 5820, profit_a_month_bad_case: 4330, profit_a_month_good_case: 7260, cash_now: 51400,
      months_of_bills_covered: 2, cash_runs_out_of_10: 0, lowest_cash_amount: 57200, lowest_cash_month: 1,
      lowest_cash_month_label: "Nov 2026",
    },
    profit: band(5800, 10, 1400), cash: band(57000, 5800, 3000),
    note: {
      text: "In a typical month you take in about $31,500 and spend about $25,700, so you keep about $5,820. Pick “Try a change” to see what a decision would do before you commit to it.",
      mode: "template", model: null, fallback: false, generated_at: "2026-10-03T10:00:00", ai_status: "none", ai_started_at: null,
    },
    assumptions: [CASH_ASSUMPTION, RENT_ASSUMPTION, CHURN_ASSUMPTION],
    assumed_by_app: true,
    ...over,
  };
}

const SKETCH_MONTHS = ["Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027", "Mar 2027", "Apr 2027", "May 2027", "Jun 2027", "Jul 2027", "Aug 2027", "Sep 2027", "Oct 2027"];

function path(profitStart: number, cashStart: number, customersStart: number, lowestMonth = 1) {
  return {
    profit: band(profitStart, 8, 1200),
    cash: band(cashStart, profitStart, 2500),
    customers: band(customersStart, -1, 25),
    lowest_cash_amount: cashStart,
    lowest_cash_month: lowestMonth,
  };
}

/** A realistic answer to a +7% price sketch (override any part). */
export function makeSketch(over: Partial<import("./api").Sketch> = {}): import("./api").Sketch {
  return {
    just_a_sketch: true, type: "price", amount: 7, start_month: 1, start_label: "November 2026",
    sentence: "Raise prices by 7% from November 2026 (month 1)", engine_version: "1", seed: 1006, iterations: 300, horizon: 12,
    month_labels: SKETCH_MONTHS, extra_profit_per_month: 534.29, profit_per_month_with_change: 6095.96,
    profit_per_month_without: 5561.67, visits_change_per_month: -382, visits_per_month_without: 7897, ahead_of_10: 9, cash_now: 25000,
    change: path(6100, 31000, 900), baseline: path(5560, 30500, 900),
    example: { before: 6.5, after: 6.96 },
    ...over,
  };
}

/** A quick-start business as the "how we worked it out" page gets it (override any part). */
export function makeHow(over: Partial<import("./api").HowOut> = {}): import("./api").HowOut {
  return {
    business_id: 1, name: "noah", industry: "cafe", currency: "USD", is_sample: false, setup_source: "quick",
    told: [
      { key: "customers_per_day", label: "Customers on a normal day", value: 150, unit: "count" },
      { key: "avg_spend", label: "Average spend per customer", value: 7, unit: "money" },
      { key: "monthly_rent", label: "Monthly rent", value: 3000, unit: "money" },
      { key: "staff", label: "People who work there", value: 4, unit: "count" },
    ],
    assumed: [CASH_ASSUMPTION, RENT_ASSUMPTION, CHURN_ASSUMPTION],
    run: { iterations: 1000, horizon: 12, engine_version: "0.1.0", seed: 1001 },
    ...over,
  };
}

function resultFor(name: string, profitStart: number, over: Record<string, number> = {}): import("./api").ScenarioResultOut {
  const b = (start: number, step: number, spread: number) => band(start, step, spread);
  const profit = b(profitStart, 10, 1500);
  return {
    scenario_id: name === "baseline" ? null : 5,
    scenario_name: name,
    bands: { profit, cash: b(30000, profitStart, 3000), customers: b(900, -1, 20), revenue: b(30000, 0, 1000), visits: b(7900, 0, 100), service_quality: b(1, 0, 0) },
    summary: {
      total_profit_p10: 52000, total_profit_p50: profitStart * 12, total_profit_p90: 84000, end_cash_p50: 100000, min_cash_p10: 25000,
      prob_cash_negative: 0, first_month_cash_risk_10pct: null, end_customers_p50: 880, avg_service_quality_p50: 1,
      ...over,
    },
  };
}

/** A saved run: "if you change nothing" and one scenario that does better. */
export function makeRun(over: Partial<import("./api").SimulationRunOut> = {}): import("./api").SimulationRunOut {
  return {
    id: 2, business_id: 1, engine_version: "0.1.0", seed: 7, iterations: 1000, horizon: 12, created_at: "2026-10-05T10:00:00",
    results: [
      resultFor("baseline", 5600, { total_profit_p50: 67000, total_profit_p10: 50000, total_profit_p90: 82000, end_cash_p50: 90000, end_customers_p50: 900 }),
      resultFor("Raise prices by 13% from November 2026", 6900, {
        total_profit_p50: 82800, total_profit_p10: 61000, total_profit_p90: 99000, end_cash_p50: 112000, end_customers_p50: 861, prob_beats_baseline_profit: 0.93,
      }),
    ],
    ...over,
  };
}
