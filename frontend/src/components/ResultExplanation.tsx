import type { SimulationRunOut } from "../api";
import { explainRun } from "../lib/resultExplanation";
import { displayScenarioName } from "../lib/scenarioLabel";
import { ResultAssumptions } from "./ResultAssumptions";
import { useId, useState, type ReactNode } from "react";
import { type ResultExplanationText } from "../lib/resultExplanation";

/** Shared, AI-free explanation. Parents must supply only a matching, settled result. */
export function ResultExplanation({ explanation, numbers, title = "Understand this result" }: {
  explanation: ResultExplanationText; numbers?: ReactNode; title?: string;
}) {
  const id = useId();
  return <section className="result-explanation" aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    <p className="result-explanation-outcome">{explanation.outcome}</p>
    <dl className="result-explanation-parts">
      <div><dt>What changes</dt><dd>{explanation.actions.map((action, index) => <p key={index}>{action}</p>)}</dd></div>
      <div><dt>Why it may help</dt><dd>{explanation.why}</dd></div>
      <div><dt>The trade-off</dt><dd>{explanation.tradeoff}</dd></div>
      <div><dt>What to check</dt><dd>{explanation.check}</dd></div>
    </dl>
    <ResultAssumptions marketing={explanation.marketing} label={title === "Understand this result" ? undefined : `Assumptions: ${title}`} />
    <p className="result-explanation-limit">Higher profit alone does not make a choice right for you.</p>
    {numbers && <details className="result-explanation-details"><summary>See the numbers</summary>{numbers}</details>}
    <details className="result-explanation-details"><summary>What could change this result?</summary>
      {explanation.uncertainty.map(line => <p key={line}>{line}</p>)}
      <p>Check your starting sales and costs, customer response and how many people you can serve. Try another amount or start date to compare the effect.</p>
    </details>
  </section>;
}

/** One plan at a time, in the stored order: never chooses the highest-profit plan for the owner. */
export function SavedResultExplanation({ run, currency }: { run: SimulationRunOut; currency: string }) {
  const plans = run.results.filter(result => result.scenario_name !== "baseline");
  const [picked, setPicked] = useState(plans[0]?.scenario_name ?? "");
  const id = useId();
  const scenario = plans.some(plan => plan.scenario_name === picked) ? picked : plans[0]?.scenario_name ?? "";
  const explanation = explainRun(run, scenario, currency);
  if (!explanation) return null;
  return <>
    {plans.length > 1 && <div className="field">
      <label htmlFor={id}>Explain a plan</label>
      <select id={id} value={scenario} onChange={event => setPicked(event.target.value)}>
        {plans.map(plan => <option key={plan.scenario_name} value={plan.scenario_name}>{displayScenarioName(plan.scenario_name)}</option>)}
      </select>
    </div>}
    <ResultExplanation key={scenario} title={`Understand “${displayScenarioName(scenario)}”`} explanation={explanation} />
  </>;
}
