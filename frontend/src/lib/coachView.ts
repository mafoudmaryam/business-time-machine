import type { CoachBar, CoachSummary, VerdictKey } from "../api";
import { formatMoney } from "./format";

/** "+$26,900" / "−$1,200". Only formats a number the engine already computed. */
export function signedMoney(value: number, currency: string): string {
  return `${value >= 0 ? "+" : "−"}${formatMoney(Math.abs(value), currency)}`;
}

/** The class that colours each verdict badge. The label text is always shown too, so colour is never the only cue. */
export const VERDICT_CLASS: Record<VerdictKey, string> = {
  good: "verdict-good",
  try: "verdict-try",
  risky: "verdict-risky",
  no: "verdict-no",
};

/** Bar widths as percentages: the biggest driver is 100%, the rest are in proportion, never thinner than a label needs. */
export function barWidths(bars: CoachBar[], minPercent = 22): number[] {
  const biggest = Math.max(...bars.map((b) => Math.abs(b.amount)), 0);
  if (biggest === 0) return bars.map(() => minPercent);
  return bars.map((b) => Math.max(minPercent, Math.round((Math.abs(b.amount) / biggest) * 100)));
}

export function yearsText(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "1 year" : `${years} years`;
  }
  return `${months} months`;
}

export type Trend = "up" | "down" | "same";

/** Up, down or "about the same". Differences under 2% are treated as the same, so a rounding wobble is not a headline. */
export function trendOf(now: number, later: number): Trend {
  const biggest = Math.max(Math.abs(now), Math.abs(later));
  if (biggest === 0 || Math.abs(later - now) <= 0.02 * biggest) return "same";
  return later > now ? "up" : "down";
}

export interface Tile {
  key: "profit" | "cash" | "customers";
  title: string;
  now: string;
  later: string;
  trend: Trend;
  /** Always shown next to the marker, so the direction never relies on colour alone. */
  trendLabel: string;
  tip: string;
  /** One sentence for screen readers. */
  spoken: string;
}

const TREND_WORDS: Record<Tile["key"], Record<Trend, string>> = {
  profit: { up: "Better", down: "Lower", same: "About the same" },
  cash: { up: "Higher", down: "Lower", same: "About the same" },
  customers: { up: "More", down: "Fewer", same: "About the same" },
};

/** The three "now -> later" tiles. Every value comes from the engine's summary; this only words them. */
export function buildTiles(summary: CoachSummary, currency: string): Tile[] {
  const later = `in ${yearsText(summary.months)}`;
  const customers = summary.customers_word ? summary.customers_word : "customers";
  const titleCase = customers.charAt(0).toUpperCase() + customers.slice(1);
  const meta: Record<Tile["key"], { title: string; tip: string; money: boolean }> = {
    profit: {
      title: "Profit a month",
      tip: `A typical month today, and the last month ${later}, if you follow this plan.`,
      money: true,
    },
    cash: {
      title: "Cash in the bank",
      tip: `The money you have today, and what is left ${later} in a typical case.`,
      money: true,
    },
    customers: {
      title: titleCase,
      tip: `How many you have today, and how many ${later} in a typical case.`,
      money: false,
    },
  };
  return summary.tiles.map((t) => {
    const m = meta[t.key];
    const fmt = (v: number) => (m.money ? formatMoney(v, currency) : Math.round(v).toLocaleString());
    const trend = trendOf(t.now, t.later);
    const trendLabel = TREND_WORDS[t.key][trend];
    return {
      key: t.key,
      title: m.title,
      now: fmt(t.now),
      later: fmt(t.later),
      trend,
      trendLabel,
      tip: m.tip,
      spoken: `Now ${fmt(t.now)}, ${later} ${fmt(t.later)}. ${trendLabel}.`,
    };
  });
}
