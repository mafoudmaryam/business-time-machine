import type { DecisionFormValues } from "../api";
import { formatMonth, formatMoney } from "./format";

function pluralize(noun: string, value: number): string {
  return Math.abs(value) === 1 ? noun : `${noun}s`;
}

/** Turns one decision lever into the plain-language sentence the owner confirms.
 * staffNoun is the industry's own word for its staff (barista/server/baker). When
 * it's not known (or a caller hasn't been updated yet), hiring falls back to the
 * original generic "FTE staff" wording -- so existing callers/tests are unaffected. */
export function decisionSummary(d: DecisionFormValues, staffNoun?: string): string {
  const from = `from ${formatMonth(d.start_month)}`;

  switch (d.type) {
    case "price":
      if (d.unit === "absolute") return `Set price to ${formatMoney(d.value)} ${from}`;
      return d.value >= 0 ? `Raise prices ${d.value}% ${from}` : `Cut prices ${Math.abs(d.value)}% ${from}`;

    case "hiring": {
      if (staffNoun) {
        const noun = pluralize(staffNoun, d.value);
        return d.value >= 0 ? `Hire ${d.value} ${noun} ${from}` : `Let go of ${Math.abs(d.value)} ${noun} ${from}`;
      }
      return d.value >= 0 ? `Add ${d.value} FTE staff ${from}` : `Cut ${Math.abs(d.value)} FTE staff ${from}`;
    }

    case "marketing":
      if (d.unit === "percent") {
        return d.value >= 0
          ? `Increase marketing spend ${d.value}% ${from}`
          : `Decrease marketing spend ${Math.abs(d.value)}% ${from}`;
      }
      return `Set marketing spend to ${formatMoney(d.value)}/month ${from}`;

    case "hours":
      return `Open ${d.value} days/month ${from}`;

    case "menu": {
      let sentence = `Change menu prices ${d.value >= 0 ? "+" : ""}${d.value}% ${from}`;
      const extras: string[] = [];
      if (d.cogs_ratio !== undefined) extras.push(`ingredient cost ratio set to ${d.cogs_ratio}%`);
      if (d.investment !== undefined) extras.push(`a ${formatMoney(d.investment)} one-off setup cost`);
      if (extras.length) sentence += `, with ${extras.join(" and ")}`;
      return sentence;
    }

    case "investment": {
      let sentence = `Invest ${formatMoney(d.value)} ${from}`;
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
