import type { ScenarioSummary } from "../api";

const RISK_THRESHOLD = 0.10;

/** "in 3 of 10 futures": the engine's probability said in tenths, the way the coach says it.
 * This only words a number the engine already computed. It never says "10 of 10" unless the
 * engine's probability is exactly 1, and never "0 of 10". */
export function futuresPhrase(probability: number): string {
  let tenths = Math.round(probability * 10);
  if (probability < 1) tenths = Math.min(tenths, 9);
  tenths = Math.max(tenths, 1);
  return `in ${tenths} of 10 futures`;
}

/**
 * Formats the engine's own risk numbers into the dashboard's red alert text.
 * This must never recompute risk -- prob_cash_negative and
 * first_month_cash_risk_10pct both come straight from btm_engine's summary.
 * Returns null when prob_cash_negative is below the 10% alert threshold.
 */
export function riskAlert(
  summary: Pick<ScenarioSummary, "prob_cash_negative" | "first_month_cash_risk_10pct">,
): string | null {
  if (summary.prob_cash_negative < RISK_THRESHOLD) return null;

  const futures = futuresPhrase(summary.prob_cash_negative);
  if (summary.first_month_cash_risk_10pct == null) {
    return `Cash may run out at some point (${futures}).`;
  }
  return `Cash may run out around month ${summary.first_month_cash_risk_10pct} (${futures}).`;
}
