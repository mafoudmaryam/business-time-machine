import { decisionOutToForm, ratioToPercent, type CoachIdea, type DecisionFormValues, type ScenarioOut } from "../api";

/** One AI-suggested decision, as an editable form value. It is never confirmed here:
 * the owner must tick "confirm" in the scenario builder (human in the loop). */
export function ideaDecisionToForm(d: CoachIdea["decisions"][number]): DecisionFormValues {
  const form: DecisionFormValues = {
    type: d.type as DecisionFormValues["type"],
    start_month: d.start_month,
    value: d.value,
    unit: d.unit,
    source: "ai",
    confirmed: false,
  };
  if (d.loan_months !== undefined) form.loan_months = d.loan_months;
  if (d.annual_rate !== undefined) form.annual_rate = ratioToPercent(d.annual_rate);
  if (d.capacity_pct !== undefined) form.capacity_pct = d.capacity_pct;
  if (d.cogs_ratio !== undefined) form.cogs_ratio = ratioToPercent(d.cogs_ratio);
  if (d.investment !== undefined) form.investment = d.investment;
  return form;
}

/** What the scenario builder should show when the owner clicks "Try this idea":
 * the parent scenario's decisions (if the idea builds on one) plus the idea's own. */
export interface ScenarioPrefill {
  name: string;
  parentScenarioId?: number;
  decisions: DecisionFormValues[];
}

export function buildIdeaPrefill(idea: CoachIdea, parent: ScenarioOut | null): ScenarioPrefill {
  const inherited = parent ? parent.decisions.map(decisionOutToForm) : [];
  const name = parent ? `${parent.name} + ${idea.title}` : idea.title;
  return {
    name,
    parentScenarioId: parent?.id,
    decisions: [...inherited, ...idea.decisions.map(ideaDecisionToForm)],
  };
}
