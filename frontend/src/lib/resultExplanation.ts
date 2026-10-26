import type { ExplanationContext, SimulationRunOut, Sketch } from "../api";
import { decisionOutToForm } from "../api";
import { decisionSummary } from "./decisionSummary";
import { formatCount, formatMoney } from "./format";
import { formatMoneyCents } from "./sketch";

export interface ResultExplanationText {
  actions: string[];
  outcome: string;
  why: string;
  tradeoff: string;
  check: string;
  uncertainty: string[];
  marketing: boolean;
}

// These labels describe an accounting contribution, not a claim about customer behaviour.
const DRIVERS: Record<string, [string, string]> = {
  price: ["Higher takings per purchase add to profit", "Lower takings per purchase reduce profit"],
  menu: ["The menu change adds to takings per purchase", "The menu change reduces takings per purchase"],
  visits: ["More visits add to sales", "Fewer visits reduce sales"],
  ingredients: ["Lower ingredient costs leave more money", "Higher ingredient costs leave less money"],
  staff: ["Lower staff costs leave more money", "Higher staff costs leave less money"],
  fixed: ["Lower marketing and running costs leave more money", "Higher marketing and running costs leave less money"],
  investment: ["Lower investment or loan payments leave more cash", "Investment or loan payments use cash"],
};
const CHECKS: Record<string, string> = {
  price: "Would your customers accept this price? Ask a few regular customers or try a small, reversible test.",
  hiring: "How many people do you need during your busiest period to serve customers well?",
  hours: "Would sales on the proposed opening days cover staffing and running costs?",
  marketing: "How many extra paying customers would this spending need to attract, and could you serve them?",
  menu: "What would each purchase bring in after ingredient costs with the changed menu?",
  investment: "Could you cover the upfront cost and repayments if sales were lower than expected?",
};
const UNKNOWN_REASON = "The result shows a difference, but there is not enough available evidence to explain its main cause.";

function sign(value: number) { return Math.abs(value) < 0.005 ? 0 : Math.sign(value); }
function evidence(context: ExplanationContext | undefined, delta: number) {
  if (!context || context.version !== 1) return { why: UNKNOWN_REASON, cost: "", check: "Which assumed sales or costs differ most from what you have observed in your business?", marketing: true };
  const drivers = Object.entries(context.central.drivers).filter(([key, value]) => DRIVERS[key] && Number.isFinite(value) && sign(value));
  drivers.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const direction = sign(delta);
  const relevant = drivers.find(([, value]) => sign(value) === direction);
  const negative = drivers.find(([, value]) => value < -0.005);
  const why = direction === 0
    ? "The estimated profit difference rounds to zero. Changes in sales and costs may offset each other."
    : sign(context.central.total) !== direction
      ? "The central calculation and the simulated comparison point in different directions. There is no clear single reason to rely on."
      : relevant
        ? `In the model, ${DRIVERS[relevant[0]][relevant[1] > 0 ? 0 : 1].toLowerCase()}.`
        : UNKNOWN_REASON;
  const primary = context.decisions[0]?.type;
  return { why, cost: [negative ? `${DRIVERS[negative[0]][1]} in the model.` : "", (context.cash_effect ?? 0) < -.005 ? "Investment or loan payments use cash; they are not deducted from the profit figure." : ""].filter(Boolean).join(" "), check: CHECKS[primary] ?? "Which assumed sales or costs differ most from what you have observed in your business?", marketing: context.decisions.some(d => d.type === "marketing") };
}

function actions(context: ExplanationContext | undefined, currency: string, fallback: string): string[] {
  if (!context || context.version !== 1) return [fallback];
  if (!context.decisions.length) return ["No change to the business inputs was proposed."];
  return context.decisions.map(d => {
    const form = decisionOutToForm({ ...d, id: 0, source: "user", confirmed: true });
    const sentence = d.type === "price" && d.unit === "absolute"
      ? `Set the average price to ${formatMoneyCents(d.value, currency)} from month ${d.start_month}`
      : decisionSummary(form, undefined, currency);
    return sentence.replace(`from month ${d.start_month}`, `from ${context.month_labels[d.start_month - 1] ?? `month ${d.start_month}`} (month ${d.start_month})`);
  });
}
function changeText(delta: number, currency: string) {
  if (sign(delta) === 0) return "no difference in money left after bills after rounding";
  return `${formatMoneyCents(Math.abs(delta), currency)} ${delta > 0 ? "more" : "less"} after bills`;
}
const CENTRAL = "The reason uses the engine’s central calculation, with uncertain inputs at their middle values. It is not a breakdown of the simulated median; those results can differ.";

export function explainSketch(sketch: Sketch, fallbackCurrency: string): ResultExplanationText {
  const currency = sketch.explanation_context?.currency ?? fallbackCurrency;
  const e = evidence(sketch.explanation_context, sketch.extra_profit_per_month);
  const visits = sketch.visits_change_per_month;
  const tradeoffs = [e.cost.startsWith("Fewer visits") && visits < -0.5 ? "" : e.cost];
  if (Math.abs(visits) >= 0.5) tradeoffs.push(`About ${formatCount(Math.abs(visits))} ${visits < 0 ? "fewer" : "more"} visits per month on average in the simulation${visits > 0 ? "; check whether you could serve them" : ""}.`);
  if (sketch.change.lowest_cash_amount < 0) tradeoffs.push("The middle cash path drops below zero.");
  return {
    actions: actions(sketch.explanation_context, currency, sketch.sentence),
    outcome: `Compared with changing nothing, the simulation shows ${changeText(sketch.extra_profit_per_month, currency)} per month, averaged over all ${sketch.horizon} months.`,
    why: e.why,
    tradeoff: tradeoffs.filter(Boolean).join(" ") || "No clear downside appears in these figures. Real sales and costs may differ from the assumptions.",
    check: e.check,
    marketing: e.marketing && sketch.type === "marketing",
    uncertainty: [CENTRAL, `The averaging includes months before the change starts. In ${sketch.ahead_of_10} of 10 simulated futures, total profit is higher than if you change nothing.`],
  };
}

export function explainRun(run: SimulationRunOut, scenario: string, fallbackCurrency: string): ResultExplanationText | null {
  const result = run.results.find(r => r.scenario_name === scenario && scenario !== "baseline");
  const baseline = run.results.find(r => r.scenario_name === "baseline");
  if (!result || !baseline) return null;
  const context = result.summary.explanation_context;
  const currency = context?.currency ?? fallbackCurrency;
  const delta = result.summary.total_profit_p50 - baseline.summary.total_profit_p50;
  const e = evidence(context, delta);
  const customers = result.summary.end_customers_p50 - baseline.summary.end_customers_p50;
  const cash = result.summary.end_cash_p50 - baseline.summary.end_cash_p50;
  const risks = [e.cost];
  if (customers < -0.5) risks.push(`About ${formatCount(-customers)} fewer regular customers at month ${run.horizon}.`);
  if (cash < -0.005) risks.push(`${formatMoney(Math.abs(cash), currency)} less cash at month ${run.horizon}.`);
  if (result.summary.min_cash_p10 < 0) risks.push("The lower cash range falls below zero.");
  return {
    actions: actions(context, currency, "This older run did not save the original action amounts and start dates. They cannot be verified from its name."),
    outcome: `Comparing the middle simulated totals with changing nothing, this change shows ${changeText(delta, currency)} over ${run.horizon} months in total.`,
    why: sign(delta) === 0 && !context ? "The middle simulated totals show no profit difference. The saved result does not explain why." : e.why,
    tradeoff: risks.filter(Boolean).join(" ") || "No clear downside appears in these figures. Different sales, costs or customer responses could change the result.",
    check: e.check,
    marketing: e.marketing,
    uncertainty: [context ? CENTRAL : "This historical run has no saved explanation context. Its current scenario may have changed since it was run.", "Totals compare each path’s middle result, not the middle of paired gains. Monthly charts show individual months, not totals."],
  };
}
