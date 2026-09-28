import type { ScenarioResultOut } from "../../api";
import { riskAlert } from "../../lib/riskAlert";
import { displayScenarioName } from "../../lib/scenarioLabel";

/** Renders the engine's own cash-risk numbers as a red alert, one per scenario
 * that trips the 10% threshold. Never computes risk itself -- see lib/riskAlert. */
export function RiskAlerts({ results }: { results: ScenarioResultOut[] }) {
  const alerts = results
    .map((r) => ({ name: displayScenarioName(r.scenario_name), message: riskAlert(r.summary) }))
    .filter((a): a is { name: string; message: string } => a.message !== null);

  if (alerts.length === 0) return null;

  return (
    <div className="risk-alerts">
      {alerts.map((a) => (
        <p key={a.name} className="risk-alert" role="alert">
          <strong>{a.name}:</strong> {a.message}
        </p>
      ))}
    </div>
  );
}
