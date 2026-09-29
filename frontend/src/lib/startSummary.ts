import type { StartingMonth } from "../api";
import { formatMoney } from "./format";

export interface StartSummary {
  text: string;
  isLoss: boolean;
  hint: string | null;
}

/** Turns the engine's month 1 into the plain sentence shown at the end of the setup wizard.
 * Only formats numbers the engine already computed. */
export function describeStartingMonth(m: StartingMonth, currency: string): StartSummary {
  const money = (v: number) => formatMoney(Math.abs(v), currency);
  const rounded = Math.round(m.profit);
  const isLoss = rounded < 0;
  const outcome =
    rounded === 0 ? "you roughly break even" : isLoss ? `you lose about ${money(m.profit)}` : `you make about ${money(m.profit)}`;
  const text = `About ${money(m.sales)} in sales and ${money(m.costs)} in costs, so ${outcome} a month.`;
  const hint = isLoss
    ? "That is a loss every month. If it doesn't match your real business, go back and check your numbers, especially staff pay, rent and what an average customer spends."
    : null;
  return { text, isLoss, hint };
}
