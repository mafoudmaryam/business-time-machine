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
