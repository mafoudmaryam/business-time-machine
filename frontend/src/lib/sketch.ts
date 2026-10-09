import type { Sketch, SketchKind, SketchPath, StartOption } from "../api";
import { formatCount, formatMoney } from "./format";

/** Words and shapes for the "Try a change" and "next 12 months" pages. Formatting and choosing text only: every number
 *  comes from the engine's sketch (see backend/app/routers/sketch.py), and the AI is never involved. */

export const PRICE_MIN = 1;
export const PRICE_MAX = 15;
export const PRICE_DEFAULT = 7;

// ---------- the coach note under the slider: plain rules on the slider's value ----------

export function priceNote(percent: number): string {
  if (percent > 10) return "That is a big jump. More of your regulars may drift away, so the gain is less certain.";
  if (percent < 4) return "Low risk, but the gain is small too.";
  return "Small rises are often noticed less than owners fear.";
}

// ---------- the right-hand card ----------

export function exampleText(example: Sketch["example"], currency: string): string | null {
  if (!example) return null;
  return `A typical ${formatMoneyCents(example.before, currency)} visit would cost ${formatMoneyCents(example.after, currency)}.`;
}

function formatMoneyCents(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export interface KeepText {
  /** "+$534" or "-$120": the big number. */
  amount: string;
  /** "more" or "less". */
  direction: "more" | "less";
  /** "That is $6,095 a month, instead of $5,561." */
  detail: string;
}

export function keepText(sketch: Sketch, currency: string): KeepText {
  const extra = sketch.extra_profit_per_month;
  const rounded = Math.round(extra);
  const sign = rounded < 0 ? "-" : "+";
  return {
    amount: `${sign}${formatMoney(Math.abs(extra), currency)}`,
    direction: rounded < 0 ? "less" : "more",
    detail: `That is ${formatMoney(sketch.profit_per_month_with_change, currency)} a month, instead of ${formatMoney(sketch.profit_per_month_without, currency)}.`,
  };
}

export interface BankTile {
  /** The lowest the money in the bank gets with this change, e.g. "$18,400". */
  amount: string;
  detail: string;
}

/** The "Money in the bank" tile: the lowest cash point of the changed path, in plain words. */
export function bankTile(sketch: Sketch, currency: string): BankTile {
  const path = sketch.change;
  const where = sketch.month_labels[path.lowest_cash_month - 1] ?? `month ${path.lowest_cash_month}`;
  const today = formatMoney(sketch.cash_now, currency);
  let detail: string;
  if (path.lowest_cash_amount < 0) detail = `Its lowest point is in ${where}, and that is below zero.`;
  else if (path.lowest_cash_amount >= sketch.cash_now) detail = `It never drops below the ${today} you have today.`;
  else detail = `Its lowest point is in ${where}. You have ${today} today.`;
  return { amount: formatMoney(path.lowest_cash_amount, currency), detail };
}

export function catchText(visitsChange: number): string {
  const n = Math.round(Math.abs(visitsChange));
  if (n === 0) return "Almost no change in visits.";
  if (visitsChange < 0) return `About ${formatCount(n)} fewer visits a month, because some people will come less often.`;
  return `About ${formatCount(n)} more visits a month.`;
}

export function futuresText(aheadOf10: number): string {
  return `You come out ahead in ${aheadOf10} of 10 possible futures.`;
}

/** Ten dots: filled for each future that comes out ahead. */
export function dots(aheadOf10: number): boolean[] {
  const n = Math.max(0, Math.min(10, Math.round(aheadOf10)));
  return Array.from({ length: 10 }, (_, i) => i < n);
}

// ---------- start buttons ----------

/** The buttons that really exist this time (the server decides the month numbers). */
export function pickStart(options: StartOption[], month: number): StartOption | undefined {
  return options.find((o) => o.month === month);
}

// ---------- saving ----------

/** A scenario name from the sketch's sentence: "Raise prices by 7% from November 2026". */
export function scenarioName(sketch: Sketch): string {
  return sketch.sentence.replace(/ \(month \d+\)$/, "");
}

// ---------- the 12-month page ----------

export interface TimelineQuery {
  type: SketchKind;
  amount: number;
  start: number;
}

const KINDS: SketchKind[] = ["price", "hours", "hiring", "marketing"];

export function timelineLink(q: TimelineQuery): string {
  return `/timeline?change=${q.type}&amount=${q.amount}&start=${q.start}`;
}

/** Reads the address; anything missing or silly falls back to a modest price rise starting next month. */
export function parseTimelineQuery(params: URLSearchParams): TimelineQuery {
  const type = params.get("change") as SketchKind | null;
  const amount = Number(params.get("amount"));
  const start = Number(params.get("start"));
  return {
    type: type && KINDS.includes(type) ? type : "price",
    amount: params.get("amount") !== null && params.get("amount") !== "" && Number.isFinite(amount) ? amount : PRICE_DEFAULT,
    start: Number.isInteger(start) && start >= 1 && start <= 12 ? start : 1,
  };
}

export function monthValueText(month: number, label: string): string {
  return `Month ${month}, ${label}`;
}

export function lowestCashSentence(path: SketchPath, labels: string[], cashNow: number, currency: string): string {
  const where = labels[path.lowest_cash_month - 1] ?? `month ${path.lowest_cash_month}`;
  const base = `Your lowest cash point is ${formatMoney(path.lowest_cash_amount, currency)}, in ${where}.`;
  if (path.lowest_cash_amount < 0) return `${base} That is below zero.`;
  if (path.lowest_cash_amount >= cashNow) return `${base} That is no lower than what you have in the bank today.`;
  return base;
}

export interface MonthCard {
  /** What you keep that month. */
  profit: number;
  cash: number;
  customers: number;
  profitBaseline: number;
  cashBaseline: number;
  customersBaseline: number;
}

/** The most likely (middle) numbers for one month, with and without the change. `month` is 1-12. */
export function monthCard(sketch: Sketch, month: number): MonthCard {
  const i = Math.max(0, Math.min(sketch.horizon - 1, month - 1));
  return {
    profit: sketch.change.profit.p50[i],
    cash: sketch.change.cash.p50[i],
    customers: sketch.change.customers.p50[i],
    profitBaseline: sketch.baseline.profit.p50[i],
    cashBaseline: sketch.baseline.cash.p50[i],
    customersBaseline: sketch.baseline.customers.p50[i],
  };
}

export interface TimelineRow {
  label: string;
  p50: number;
  range: [number, number];
  baseline: number;
}

export type TimelineMetric = "profit" | "cash" | "customers";

export function timelineRows(sketch: Sketch, metric: TimelineMetric): TimelineRow[] {
  return sketch.month_labels.map((label, i) => ({
    label,
    p50: sketch.change[metric].p50[i],
    range: [sketch.change[metric].p10[i], sketch.change[metric].p90[i]],
    baseline: sketch.baseline[metric].p50[i],
  }));
}
