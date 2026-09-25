import type { DecisionFormValues } from "../api";
import { formatMonth, formatMoney } from "./format";

/** Turns one decision lever into the plain-language sentence the owner confirms. */
export function decisionSummary(d: DecisionFormValues): string {
  const from = `from ${formatMonth(d.start_month)}`;

  switch (d.type) {
    case "price":
      if (d.unit === "absolute") return `Set price to ${formatMoney(d.value)} ${from}`;
      return d.value >= 0 ? `Raise prices ${d.value}% ${from}` : `Cut prices ${Math.abs(d.value)}% ${from}`;

    case "hiring":
      return d.value >= 0 ? `Add ${d.value} FTE staff ${from}` : `Cut ${Math.abs(d.value)} FTE staff ${from}`;

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
