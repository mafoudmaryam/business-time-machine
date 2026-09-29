import type { DecisionFormValues } from "../api";
import { DEFAULT_CURRENCY, formatMonth, formatMoney, formatPrice } from "./format";

function pluralize(noun: string, value: number): string {
  return Math.abs(value) === 1 ? noun : `${noun}s`;
}

/** Turns one decision lever into the plain-language sentence the owner confirms.
 * staffNoun is the industry's own word for its staff (barista/server/baker). When
 * it's not known (or a caller hasn't been updated yet), hiring falls back to the
 * original generic "full-time staff" wording -- so existing callers/tests are
 * unaffected. currency defaults to USD when a caller doesn't know the business's
 * own currency yet. */
export function decisionSummary(d: DecisionFormValues, staffNoun?: string, currency = DEFAULT_CURRENCY): string {
  const from = `from ${formatMonth(d.start_month)}`;
  const money = (value: number) => formatMoney(value, currency);

  switch (d.type) {
    case "price":
      if (d.unit === "absolute") return `Set price to ${formatPrice(d.value, currency)} ${from}`;
      return d.value >= 0 ? `Raise prices ${d.value}% ${from}` : `Cut prices ${Math.abs(d.value)}% ${from}`;

    case "hiring": {
      if (staffNoun) {
        const noun = pluralize(staffNoun, d.value);
        return d.value >= 0 ? `Hire ${d.value} ${noun} ${from}` : `Let go of ${Math.abs(d.value)} ${noun} ${from}`;
      }
      return d.value >= 0 ? `Add ${d.value} full-time staff ${from}` : `Cut ${Math.abs(d.value)} full-time staff ${from}`;
    }

    case "marketing":
      if (d.unit === "percent") {
        return d.value >= 0
          ? `Increase marketing spend ${d.value}% ${from}`
          : `Decrease marketing spend ${Math.abs(d.value)}% ${from}`;
      }
      return `Set marketing spend to ${money(d.value)}/month ${from}`;

    case "hours":
      return `Open ${d.value} days/month ${from}`;

    case "menu": {
      let sentence = `Change menu prices ${d.value >= 0 ? "+" : ""}${d.value}% ${from}`;
      const extras: string[] = [];
      if (d.cogs_ratio !== undefined) extras.push(`ingredient costs set to ${d.cogs_ratio}% of sales`);
      if (d.investment !== undefined) extras.push(`a ${money(d.investment)} one-off setup cost`);
      if (extras.length) sentence += `, with ${extras.join(" and ")}`;
      return sentence;
    }

    case "investment": {
      let sentence = `Invest ${money(d.value)} ${from}`;
      if (d.loan_months) {
        sentence += `, financed over ${d.loan_months} months`;
        if (d.annual_rate !== undefined) sentence += ` at ${d.annual_rate}% annual interest`;
      }
      if (d.capacity_pct) sentence += `, adding ${d.capacity_pct}% capacity`;
      return sentence;
    }

    default:
      return `${d.type} change ${from}`;
  }
}
