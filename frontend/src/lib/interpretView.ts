import { ratioToPercent, type DecisionFormValues, type Interpretation, type InterpretedDecision } from "../api";
import type { DecisionType } from "../constants";
import { decisionSummary } from "./decisionSummary";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 2026" -- simulation month 1 is the calendar month AFTER today's. */
export function monthOneLabel(today: Date = new Date()): string {
  const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
}

export const MONTH_HINT = (today?: Date) =>
  `Month 1 is ${monthOneLabel(today)}, the month after this one. “Summer” means June to August.`;

/** A name for the scenario made from the owner's own words ("Raise prices 10% in March and hire a…"). */
export function suggestName(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  if (!clean) return "";
  const named = clean.charAt(0).toUpperCase() + clean.slice(1);
  return named.length <= 60 ? named : `${named.slice(0, 57).trimEnd()}…`;
}

/** One interpreted decision as an editable step. Never confirmed: the owner ticks it themselves. */
export function interpretedToForm(d: InterpretedDecision, interpretationId: number): DecisionFormValues {
  const form: DecisionFormValues = {
    type: d.type as DecisionType,
    start_month: d.start_month,
    value: d.value,
    unit: d.unit,
    source: "ai",
    confirmed: false,
    origin: {
      interpretationId,
      quote: d.source_quote,
      sentence: d.sentence,
      whenLabel: d.when_label,
      group: d.group,
      role: d.role,
      groupSentence: d.group_sentence,
    },
  };
  if (d.loan_months !== undefined && d.loan_months !== null) form.loan_months = d.loan_months;
  if (d.annual_rate !== undefined && d.annual_rate !== null) form.annual_rate = ratioToPercent(d.annual_rate);
  if (d.capacity_pct !== undefined && d.capacity_pct !== null) form.capacity_pct = d.capacity_pct;
  if (d.cogs_ratio !== undefined && d.cogs_ratio !== null) form.cogs_ratio = ratioToPercent(d.cogs_ratio);
  if (d.investment !== undefined && d.investment !== null) form.investment = d.investment;
  return form;
}

export function stepsFromInterpretation(result: Interpretation): DecisionFormValues[] {
  return result.decisions.map((d) => interpretedToForm(d, result.id));
}

/** The decision that switches a temporary change back off, or null when that cannot be done exactly
 * (only hiring, and percentage changes to prices or marketing, can be undone). */
export function reverseOf(d: DecisionFormValues, endMonth: number): DecisionFormValues | null {
  let value: number;
  if (d.type === "hiring") {
    value = -d.value;
  } else if ((d.type === "price" || d.type === "marketing") && d.unit === "percent" && d.value > -100) {
    value = Math.round((1 / (1 + d.value / 100) - 1) * 100 * 1e4) / 1e4;
  } else {
    return null;
  }
  return {
    type: d.type,
    start_month: endMonth,
    value,
    unit: d.unit,
    source: d.source,
    confirmed: false,
    edited: true,
    origin: d.origin && { ...d.origin, role: "end" },
  };
}

export type StepItem =
  | { kind: "single"; index: number; step: DecisionFormValues }
  | { kind: "pair"; index: number; endIndex: number; start: DecisionFormValues; end: DecisionFormValues };

/** Lists steps for display: a temporary change (start + its reversing end) is shown as ONE item. */
export function groupSteps(steps: DecisionFormValues[]): StepItem[] {
  const items: StepItem[] = [];
  const used = new Set<number>();
  steps.forEach((step, index) => {
    if (used.has(index)) return;
    const group = step.origin?.group;
    if (group && step.origin?.role === "start") {
      const endIndex = steps.findIndex((s, j) => j !== index && !used.has(j) && s.origin?.group === group && s.origin?.role === "end");
      if (endIndex !== -1) {
        used.add(endIndex);
        items.push({ kind: "pair", index, endIndex, start: step, end: steps[endIndex] });
        return;
      }
    }
    items.push({ kind: "single", index, step });
  });
  return items;
}

/** The sentence for a step: the app's own words while it is as the AI read it, the form's wording once the owner edits it. */
export function stepSentence(step: DecisionFormValues, staffNoun: string, currency: string): string {
  if (step.origin && !step.edited && step.origin.sentence) return step.origin.sentence;
  return decisionSummary(step, staffNoun, currency);
}

export function pairSentence(start: DecisionFormValues, end: DecisionFormValues, staffNoun: string, currency: string): string {
  if (start.origin && !start.edited && !end.edited && start.origin.groupSentence) return start.origin.groupSentence;
  return `${decisionSummary(start, staffNoun, currency)}, then back to normal from month ${end.start_month}`;
}

/** Replaces one step (or a start + end pair) after the owner edited it. Editing always un-ticks it.
 * `endMonth` is the "back to normal" month for a pair; null makes the change permanent. */
export function applyEdit(
  steps: DecisionFormValues[],
  item: StepItem,
  edited: DecisionFormValues,
  endMonth: number | null,
): DecisionFormValues[] {
  const next = [...steps];
  const start: DecisionFormValues = { ...edited, source: item.kind === "pair" ? item.start.source : edited.source, edited: true, confirmed: false, origin: item.kind === "pair" ? item.start.origin : steps[item.index].origin };
  next[item.index] = start;
  if (item.kind === "single") return next;

  const end = endMonth !== null && endMonth > start.start_month ? reverseOf(start, endMonth) : null;
  if (end) {
    next[item.endIndex] = end;
    return next;
  }
  // No way to undo it (or no end month): it becomes an ordinary permanent step.
  next[item.index] = { ...start, origin: start.origin && { ...start.origin, group: null, role: null, groupSentence: null } };
  return next.filter((_, i) => i !== item.endIndex);
}
