import { percentToRatio, type Assumption, type QuickAnswers, type TodayOut } from "../api";
import { formatCount, formatMoney } from "./format";

/** Everything the Today page and the start screen need to turn engine numbers into words. Formatting only: no math
 * beyond rounding and picking, because every number comes from the engine. */

// ---------- start screen ----------

export type AnswerKey = keyof QuickAnswers;
export type AnswerDraft = Record<AnswerKey, number>; // NaN while empty or half-typed

export function validateAnswers(a: AnswerDraft): Partial<Record<AnswerKey, string>> {
  const errors: Partial<Record<AnswerKey, string>> = {};
  const bad = (v: number) => !Number.isFinite(v);
  if (bad(a.customers_per_day)) errors.customers_per_day = "Enter a number.";
  else if (a.customers_per_day <= 0) errors.customers_per_day = "Must be more than 0.";
  else if (a.customers_per_day > 20_000) errors.customers_per_day = "That looks too big. Enter customers on a normal day.";
  if (bad(a.avg_spend)) errors.avg_spend = "Enter a number.";
  else if (a.avg_spend <= 0) errors.avg_spend = "Must be more than 0.";
  else if (a.avg_spend > 100_000) errors.avg_spend = "That looks too big. Enter what one customer spends.";
  if (bad(a.monthly_rent)) errors.monthly_rent = "Enter a number (0 if you pay no rent).";
  else if (a.monthly_rent < 0) errors.monthly_rent = "Can't be negative.";
  if (bad(a.staff)) errors.staff = "Enter a number.";
  else if (a.staff <= 0) errors.staff = "Count at least one person (you can count yourself).";
  else if (a.staff > 500) errors.staff = "That looks too big.";
  return errors;
}

export function toAnswers(a: AnswerDraft): QuickAnswers {
  return { customers_per_day: a.customers_per_day, avg_spend: a.avg_spend, monthly_rent: a.monthly_rent, staff: a.staff };
}

const NAME_DEFAULTS: Record<string, string> = { cafe: "My café", restaurant: "My restaurant", bakery: "My bakery" };

export function defaultBusinessName(industryId: string): string {
  return NAME_DEFAULTS[industryId] ?? "My business";
}

// ---------- Today tiles ----------

export interface Tile {
  title: string;
  help: string;
  headline: string;
  detail: string;
  risk: string | null;
  tone: "good" | "bad" | "neutral";
}

export function profitTile(t: TodayOut["tiles"], currency: string): Tile {
  const loss = t.profit_a_month < 0;
  const money = (v: number) => formatMoney(Math.abs(v), currency);
  const phrase = (v: number) => (v >= 0 ? `keep ${money(v)}` : `lose ${money(v)}`);
  return {
    title: "What you keep each month",
    help: "What is left of your sales after paying for ingredients, staff, rent and everything else, in a normal month.",
    headline: money(t.profit_a_month),
    detail: `${loss ? "You lose" : "You keep"} about this in a normal month. In a bad month you might ${phrase(t.profit_a_month_bad_case)}; in a good month, ${phrase(t.profit_a_month_good_case)}.`,
    risk: loss ? "That is a loss. Check your numbers or look at your costs." : null,
    tone: loss ? "bad" : "good",
  };
}

export function safetyTile(t: TodayOut["tiles"], currency: string): Tile {
  const n = t.months_of_bills_covered;
  const covers =
    n < 1 ? "That is less than one month of bills." : n === 1 ? "That covers about 1 month of bills." : `That covers about ${n} months of bills.`;
  const risky = t.cash_runs_out_of_10 > 0;
  return {
    title: "Your safety net",
    help: "The cash you have in the bank today, and how long it would pay your bills.",
    headline: formatMoney(t.cash_now, currency),
    detail: `In the bank today. ${covers}`,
    risk: risky ? `Cash runs out in ${t.cash_runs_out_of_10} of 10 possible futures.` : null,
    tone: risky ? "bad" : "neutral",
  };
}

export function lowestCashTile(t: TodayOut["tiles"], currency: string): Tile {
  const below = t.lowest_cash_amount < 0;
  // For a business that earns money, cash only grows: its "lowest" is just the first month-end, higher than today.
  const neverDips = t.lowest_cash_amount >= t.cash_now;
  return {
    title: "Your lowest cash point",
    help: "The month when the money in your bank is at its lowest over the next 12 months, if you change nothing.",
    headline: formatMoney(neverDips ? t.cash_now : t.lowest_cash_amount, currency),
    detail: neverDips
      ? "Your cash does not drop below what you have today, if you change nothing."
      : `Around ${t.lowest_cash_month_label}, if you change nothing.`,
    risk: below ? "That is below zero." : null,
    tone: below ? "bad" : "neutral",
  };
}

const INDUSTRY_WORDS: Record<string, string> = { cafe: "café", restaurant: "restaurant", bakery: "bakery" };

/** "cafe" -> "café", for sentences. */
export function industryWord(id: string): string {
  return INDUSTRY_WORDS[id] ?? "business";
}

// ---------- chart ----------

export type ChartKind = "profit" | "cash";

export interface ChartRow {
  label: string;
  p10: number;
  p50: number;
  p90: number;
  range: [number, number]; // bad case to good case, drawn as the shaded band
}

export function chartRows(today: TodayOut, kind: ChartKind): ChartRow[] {
  const band = today[kind];
  return today.month_labels.map((label, i) => ({
    label,
    p10: band.p10[i],
    p50: band.p50[i],
    p90: band.p90[i],
    range: [band.p10[i], band.p90[i]],
  }));
}

// ---------- what we assumed ----------

export function formatAssumptionValue(a: Assumption, currency: string): string {
  switch (a.unit) {
    case "money":
      return formatMoney(a.value, currency);
    case "count":
      return formatCount(a.value);
    case "percent":
      return `${Math.round(a.value * 100)}%`;
    case "days":
      return `${Math.round(a.value)} days`;
    default:
      return String(Math.round(a.value * 10) / 10);
  }
}

/** What the owner types for a field: percent fields are shown 0-100, and the API stores 0-1. */
export function entryValue(a: Assumption): number {
  return a.unit === "percent" ? Math.round(a.value * 1000) / 10 : a.value;
}

export function apiValue(a: Assumption, entered: number): number {
  return a.unit === "percent" ? percentToRatio(entered) : entered;
}

export function validateAssumption(a: Assumption, entered: number): string | null {
  if (!Number.isFinite(entered)) return "Enter a number.";
  if (entered < 0) return "Can't be negative.";
  if (a.unit === "percent" && entered >= 100) return "Must be less than 100.";
  if (a.field === "open_days" && (entered <= 0 || entered > 31)) return "Between 1 and 31 days.";
  if ((a.field === "visits_per_regular" || a.field === "avg_ticket" || a.field === "staff_fte") && entered <= 0) {
    return "Must be more than 0.";
  }
  return null;
}

// ---------- the coach's note ----------

export function noteIsPending(note: TodayOut["note"]): boolean {
  return note !== null && note.ai_status === "pending";
}
