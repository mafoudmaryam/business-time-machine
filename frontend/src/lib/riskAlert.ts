import type { ScenarioSummary } from "../api";
import { formatPercent } from "./format";

const RISK_THRESHOLD = 0.10;

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

  const chance = formatPercent(summary.prob_cash_negative * 100);
  if (summary.first_month_cash_risk_10pct == null) {
    return `Cash may run out at some point (${chance} chance).`;
  }
  return `Cash may run out around month ${summary.first_month_cash_risk_10pct} (${chance} chance).`;
}
