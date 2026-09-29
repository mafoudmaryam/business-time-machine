import type { ScenarioResultOut } from "../../api";
import { InfoTip } from "../../components/InfoTip";
import { DEFAULT_CURRENCY, capitalize, formatCount, formatMoney, formatPercent } from "../../lib/format";
import { displayScenarioName } from "../../lib/scenarioLabel";

interface Props {
  results: ScenarioResultOut[];
  customerNoun?: string; // "regulars" / "guests" / "customers" -- see GET /industries
  currency?: string;
}

/** Doubles as the accessible table view of the charts: every number the charts
 * show is also here as text. */
export function SummaryTable({ results, customerNoun = "customers", currency = DEFAULT_CURRENCY }: Props) {
  return (
    <table className="summary-table">
      <thead>
        <tr>
          <th>Scenario</th>
          <th>
            Total profit, bad case{" "}
            <InfoTip text="A pessimistic outcome: only 1 in 10 simulated futures did worse than this." />
          </th>
          <th>
            Total profit, most likely <InfoTip text="The middle outcome: half of simulated futures did better, half did worse." />
          </th>
          <th>
            Total profit, good case{" "}
            <InfoTip text="An optimistic outcome: only 1 in 10 simulated futures did better than this." />
          </th>
          <th>
            Cash left at the end (most likely){" "}
            <InfoTip text="Cash on hand at the end of the simulation, in the middle-outcome future." />
          </th>
          <th>
            {capitalize(customerNoun)} left at the end (most likely){" "}
            <InfoTip text={`How many ${customerNoun} are still coming back, in the middle-outcome future.`} />
          </th>
          <th>
            Chance cash runs out{" "}
            <InfoTip text="The chance that cash drops below zero at some point during the simulation." />
          </th>
          <th>
            Chance this beats doing nothing{" "}
            <InfoTip text="The chance this scenario ends up more profitable than doing nothing." />
          </th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={r.scenario_name}>
            <td>{displayScenarioName(r.scenario_name)}</td>
            <td>{formatMoney(r.summary.total_profit_p10, currency)}</td>
            <td>{formatMoney(r.summary.total_profit_p50, currency)}</td>
            <td>{formatMoney(r.summary.total_profit_p90, currency)}</td>
            <td>{formatMoney(r.summary.end_cash_p50, currency)}</td>
            <td>{formatCount(r.summary.end_customers_p50)}</td>
            <td>{formatPercent(r.summary.prob_cash_negative * 100)}</td>
            <td>
              {r.summary.prob_beats_baseline_profit === undefined
                ? "—"
                : formatPercent(r.summary.prob_beats_baseline_profit * 100)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
