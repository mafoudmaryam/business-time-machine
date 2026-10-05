import type {
  JournalAccuracy, JournalComparison, JournalDue, JournalEntryIn, JournalForecastMonth, JournalMetric, JournalMonthOut, JournalPosition,
} from "../api";

/** Words, month lists and drawing positions for the journal. No forecasting and no comparing here: the server does the
 *  arithmetic, and these helpers only lay its results out. */

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthKey(year: number, month1: number): string {
  return `${String(year).padStart(4, "0")}-${String(month1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1] ?? key} ${year}`;
}

export interface MonthOption {
  value: string;
  label: string;
}

/** The months an owner can write down: this month and the eleven before it, newest first. The current month is allowed
 *  (an owner may fill it in on the last day); a month that has not started is not. */
export function monthOptions(now: Date, count = 12): MonthOption[] {
  const out: MonthOption[] = [];
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  for (let i = 0; i < count; i++) {
    const value = monthKey(year, month);
    out.push({ value, label: i === 0 ? `${monthLabel(value)} (this month)` : monthLabel(value) });
    month -= 1;
    if (month === 0) {
      year -= 1;
      month = 12;
    }
  }
  return out;
}

/** Which month the form starts on: the first one we are waiting for, otherwise last month (the one that just ended). */
export function startingMonth(due: JournalDue[], now: Date): string {
  if (due.length > 0) return due[0].month;
  const options = monthOptions(now, 2);
  return options[1].value;
}

// ---------- what the three numbers mean (shown behind the "?" and under each box) ----------

export const METRIC_WORDS: Record<JournalMetric, { title: string; help: string; short: string }> = {
  profit: {
    title: "What you kept",
    short: "profit",
    help: "Everything that came in during the month, minus everything you paid out (ingredients, pay, rent, bills, loan payments). If you spent more than you took in, enter it as a negative number, like -400.",
  },
  cash: {
    title: "Money in the bank",
    short: "cash",
    help: "How much money the business had at the end of the last day of the month. Count the bank account and the till.",
  },
  visits: {
    title: "Customer visits",
    short: "customer visits",
    help: "How many times customers came in during the month. A regular who came four times counts as four. If you don't know exactly, a rough count is fine.",
  },
};

// ---------- checking what was typed ----------

export interface EntryDraft {
  month: string;
  profit: number;
  cash: number;
  visits: number;
  note: string;
}

export interface EntryErrors {
  profit?: string;
  cash?: string;
  visits?: string;
  month?: string;
}

const BIG = 1e12;

export function validateEntry(d: EntryDraft): EntryErrors {
  const errors: EntryErrors = {};
  if (!d.month) errors.month = "Please pick a month.";
  const money = (v: number) => (Number.isNaN(v) ? "Please enter a number." : Math.abs(v) > BIG ? "That number is too big." : undefined);
  const e1 = money(d.profit);
  const e2 = money(d.cash);
  if (e1) errors.profit = e1;
  if (e2) errors.cash = e2;
  if (Number.isNaN(d.visits)) errors.visits = "Please enter a number.";
  else if (d.visits < 0) errors.visits = "This can't be less than 0.";
  else if (d.visits > 1e9) errors.visits = "That number is too big.";
  return errors;
}

export function toEntryIn(d: EntryDraft): JournalEntryIn {
  return { month: d.month, actual_profit: d.profit, actual_cash: d.cash, actual_visits: d.visits, note: d.note.trim() || null };
}

// ---------- words about where a figure landed ----------

export const POSITION_WORDS: Record<JournalPosition, string> = {
  inside: "Inside the range we showed",
  above: "Better than we expected",
  below: "Lower than we expected",
};

/** The same three statuses as written in the CSV file. */
const CSV_STATUS: Record<JournalPosition, string> = {
  inside: "inside the range we showed",
  above: "better than the range",
  below: "below the range",
};

/** One short sentence about how the ranges did over several months of one metric. */
export function accuracySentence(a: JournalAccuracy): string {
  const what = METRIC_WORDS[a.metric].short;
  const months = a.months === 1 ? "1 month" : `${a.months} months`;
  if (a.inside === a.months) return `Over ${months}, your ${what} landed inside our range every time.`;
  const parts = [`${a.inside} inside`, `${a.above} above`, `${a.below} below`];
  return `Over ${months}, your ${what} landed ${parts.join(", ")} our range.`;
}

// ---------- the little range bar ----------

export interface RangeBarGeometry {
  /** Positions along the bar, 0 to 100. */
  low: number;
  expected: number;
  high: number;
  actual: number;
}

/** Scales the expected range and the real figure onto one bar. The bar always has some padding, and always includes the
 *  real figure even when it is far outside the range. */
export function rangeBar(c: Pick<JournalComparison, "actual" | "expected_low" | "expected" | "expected_high">): RangeBarGeometry {
  const lo = Math.min(c.expected_low, c.actual);
  const hi = Math.max(c.expected_high, c.actual);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  const start = lo - pad;
  const span = hi + pad - start;
  const at = (v: number) => Math.round(((v - start) / span) * 1000) / 10;
  return { low: at(c.expected_low), expected: at(c.expected), high: at(c.expected_high), actual: at(c.actual) };
}

// ---------- typing amounts the way people do ----------

/** "5200", "5,200", "$5,200", "-400", "-$400", "5200.50" -> a number. Anything else -> NaN (we never guess:
 *  "5,2" could mean 5.2 or 52, so it is refused and the owner is asked for a number). */
export function parseAmount(text: string): number {
  const t = text.trim().replace(/[\s$€£¥]/g, "").replace(/^[−–]/, "-");
  const plain = /^-?(\d+\.?\d*|\.\d+)$/;
  const grouped = /^-?\d{1,3}(,\d{3})+(\.\d*)?$/;
  if (grouped.test(t)) return Number(t.replace(/,/g, ""));
  return plain.test(t) ? Number(t) : NaN;
}

// ---------- the short summary (a template, not an AI) ----------

/** "You have recorded 3 months. 2 of 3 landed inside our range." Honest about small numbers and about misses. Judged on profit. */
export function journalSummary(entries: JournalMonthOut[]): string {
  const n = entries.length;
  if (n === 0) return "";
  const recorded = `You have recorded ${n === 1 ? "1 month" : `${n} months`}.`;
  const profit = entries.map((m) => m.comparisons.find((c) => c.metric === "profit")).filter((c): c is JournalComparison => !!c);
  if (profit.length === 0) return `${recorded} We had not made a forecast for ${n === 1 ? "it" : "them"} yet, so there is nothing to compare.`;
  const inside = profit.filter((c) => c.position === "inside").length;
  const lead = `${recorded} ${inside} of ${profit.length} ${profit.length === 1 ? "month we could compare" : "months we could compare"} landed inside our range.`;
  if (profit.length < 3) return `${lead} A few months can't tell us much yet.`;
  if (inside / profit.length < 0.5) return `${lead} That means our forecasts were often off, so please treat them as a rough guide, not a promise.`;
  return `${lead} That is still a small number of months, so it doesn't prove much either way.`;
}

// ---------- the chart ----------

export interface ChartGeometry {
  width: number;
  height: number;
  bandPath: string;
  medianPath: string;
  dots: { month: string; label: string; x: number; y: number; position: JournalPosition | null }[];
  top: number;
  bottom: number;
  firstLabel: string;
  lastLabel: string;
}

const PAD = { left: 14, right: 14, top: 10, bottom: 10 };

/** Lays the 12-month profit band and the owner's real months out on a width x height drawing. Only geometry, no forecasting. */
export function chartGeometry(months: JournalForecastMonth[], entries: JournalMonthOut[], width = 600, height = 220): ChartGeometry {
  const byMonth = new Map(entries.map((m) => [m.entry.month, m]));
  const actuals = months.flatMap((f) => (byMonth.has(f.month) ? [byMonth.get(f.month)!.entry.actual_profit] : []));
  const lo = Math.min(...months.map((f) => f.p10), ...actuals);
  const hi = Math.max(...months.map((f) => f.p90), ...actuals);
  const span = hi - lo || Math.abs(hi) || 1;
  const x = (i: number) => PAD.left + (months.length <= 1 ? 0 : (i / (months.length - 1)) * (width - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * (height - PAD.top - PAD.bottom);
  const r = (n: number) => Math.round(n * 10) / 10;
  const upper = months.map((f, i) => `${r(x(i))},${r(y(f.p90))}`);
  const lower = months.map((f, i) => `${r(x(i))},${r(y(f.p10))}`).reverse();
  return {
    width, height,
    bandPath: months.length ? `M${upper.join(" L")} L${lower.join(" L")} Z` : "",
    medianPath: months.length ? `M${months.map((f, i) => `${r(x(i))},${r(y(f.p50))}`).join(" L")}` : "",
    dots: months.flatMap((f, i) => {
      const m = byMonth.get(f.month);
      if (!m) return [];
      const c = m.comparisons.find((k) => k.metric === "profit");
      return [{ month: f.month, label: f.month_label, x: r(x(i)), y: r(y(m.entry.actual_profit)), position: c ? c.position : null }];
    }),
    top: hi, bottom: lo,
    firstLabel: months[0]?.month_label ?? "", lastLabel: months[months.length - 1]?.month_label ?? "",
  };
}

// ---------- download my journal (CSV) ----------

const CSV_HEADER = ["month", "figure", "predicted_p10", "predicted_p50", "predicted_p90", "actual", "difference", "status", "note"];
const FIGURE_NAME: Record<JournalMetric, string> = { profit: "profit", cash: "cash in the bank", visits: "customer visits" };

function csvCell(value: string | number): string {
  let text = String(value);
  // A note that starts like a spreadsheet formula is made harmless (the usual CSV-injection guard).
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per month per figure (profit, cash in the bank, customer visits). Months with no forecast have the predicted
 *  columns empty and the status "not compared". Oldest month first. */
export function journalCsv(entries: JournalMonthOut[]): string {
  const rows: (string | number)[][] = [CSV_HEADER];
  for (const m of [...entries].sort((a, b) => a.entry.month.localeCompare(b.entry.month))) {
    const e = m.entry;
    const actual: Record<JournalMetric, number> = { profit: e.actual_profit, cash: e.actual_cash, visits: e.actual_visits };
    for (const metric of ["profit", "cash", "visits"] as JournalMetric[]) {
      const c = m.comparisons.find((k) => k.metric === metric);
      rows.push([
        e.month, FIGURE_NAME[metric],
        c ? c.expected_low : "", c ? c.expected : "", c ? c.expected_high : "",
        actual[metric], c ? c.difference : "", c ? CSV_STATUS[c.position] : "not compared", e.note ?? "",
      ]);
    }
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
