import { decisionOutToForm, type BaselineFormValues, type DecisionFormValues, type ScenarioOut } from "../api";
import type { DecisionType, FieldSpec } from "../constants";

/** What the advisor offers when you're asked "What decision is on your mind?".
 * Written the way an owner would say it, not as a category name. */
export function decisionChoiceLabel(type: DecisionType, staffNoun: string): string {
  switch (type) {
    case "price":
      return "Change my prices";
    case "hiring":
      return `Hire or let go of a ${staffNoun}`;
    case "marketing":
      return "Spend more (or less) on marketing";
    case "hours":
      return "Open more (or fewer) days";
    case "menu":
      return "Change the menu";
    case "investment":
      return "Buy new equipment";
  }
}

/** The advisor's follow-up question once you've picked a kind of decision. */
export function decisionQuestion(type: DecisionType, staffNoun: string): string {
  switch (type) {
    case "price":
      return "How much would you change your prices, and from which month?";
    case "hiring":
      return `How many ${staffNoun}s, and from which month?`;
    case "marketing":
      return "How much would you spend on marketing, and from when?";
    case "hours":
      return "How many days a month would you open, and from when?";
    case "menu":
      return "How much more (or less) would a typical customer spend with the new menu?";
    case "investment":
      return "What would you buy, and how would you pay for it?";
  }
}

/** Sensible starting values, so the owner only has to nudge a number. */
export function defaultDecision(type: DecisionType, baseline?: BaselineFormValues | null): DecisionFormValues {
  const base = { type, start_month: 1, source: "user" as const, confirmed: false };
  switch (type) {
    case "price":
      return { ...base, value: 10, unit: "percent" };
    case "hiring":
      return { ...base, value: 1, unit: "fte" };
    case "marketing":
      return { ...base, value: 20, unit: "percent" };
    case "hours":
      return { ...base, value: baseline ? Math.min(31, Math.round(baseline.open_days) + 2) : 28, unit: "days" };
    case "menu":
      return { ...base, value: 8, unit: "percent" };
    case "investment":
      return { ...base, value: 5000, unit: "amount", loan_months: 0, annual_rate: 0, capacity_pct: 0 };
  }
}

export const LATEST_START_MONTH = 36;

/** Checks a decision before it goes into the plan. Returns plain-language problems by field.
 * Only basic checks: the engine does its own full validation when it simulates. */
export function decisionProblems(d: DecisionFormValues): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!Number.isInteger(d.start_month) || d.start_month < 1 || d.start_month > LATEST_START_MONTH) {
    problems.start_month = `Pick a month from 1 to ${LATEST_START_MONTH}.`;
  }
  if (!Number.isFinite(d.value)) problems.value = "Enter a number.";
  else if (d.type === "hours" && (d.value < 1 || d.value > 31)) problems.value = "Pick 1 to 31 days.";
  else if ((d.type === "investment" || d.unit === "absolute" || d.unit === "per_month") && d.value < 0) {
    problems.value = "Enter an amount of 0 or more.";
  } else if (d.unit === "percent" && d.value <= -100) problems.value = "That would take it below zero.";
  for (const key of ["loan_months", "annual_rate", "capacity_pct", "cogs_ratio", "investment"] as const) {
    const v = d[key];
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) problems[key] = "Enter a number of 0 or more.";
  }
  return problems;
}

/** Checks one group of the "about your business" numbers. */
export function baselineProblems(fields: FieldSpec[], baseline: BaselineFormValues): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const field of fields) {
    const value = baseline[field.key as keyof BaselineFormValues];
    if (!Number.isFinite(value)) problems[field.key] = "Enter a number.";
    else if (value < field.min) problems[field.key] = `Must be at least ${field.min}.`;
    else if (field.max !== undefined && value > field.max) problems[field.key] = `Must be at most ${field.max}.`;
  }
  return problems;
}

/** A short, unique name for a plan, built from its steps ("Raise prices 10% from month 3").
 * If that name is already taken, a number is added so saving never fails on a duplicate. */
export function planName(summaries: string[], existingNames: string[]): string {
  let name = summaries.join(" + ");
  if (name.length > 80) name = `${name.slice(0, 77).trimEnd()}…`;
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`.toLowerCase())) n += 1;
  return `${name} (${n})`;
}

const COMPARED_KEYS = ["type", "start_month", "value", "unit", "loan_months", "annual_rate", "capacity_pct", "cogs_ratio", "investment"] as const;

function sameDecision(a: DecisionFormValues, b: DecisionFormValues): boolean {
  return COMPARED_KEYS.every((k) => {
    const x = a[k];
    const y = b[k];
    if (typeof x === "number" && typeof y === "number") return Math.abs(x - y) < 1e-6;
    return (x ?? 0) === (y ?? 0);
  });
}

/** A saved, fully confirmed plan with exactly these steps -- so trying the same plan twice
 * reuses it instead of saving a duplicate. */
export function findSamePlan(plan: DecisionFormValues[], saved: ScenarioOut[]): ScenarioOut | null {
  return (
    saved.find(
      (s) =>
        s.decisions.length === plan.length &&
        s.decisions.every((d) => d.confirmed) &&
        s.decisions.every((d, i) => sameDecision(decisionOutToForm(d), plan[i])),
    ) ?? null
  );
}
