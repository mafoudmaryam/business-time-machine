import type { ScenarioResultOut } from "../../api";
import { InfoTip } from "../../components/InfoTip";
import { capitalize, formatCount, formatMoney, formatPercent } from "../../lib/format";

interface Props {
  results: ScenarioResultOut[];
  customerNoun?: string; // "regulars" / "guests" / "customers" -- see GET /industries
}

/** Doubles as the accessible table view of the charts: every number the charts
 * show is also here as text. */
export function SummaryTable({ results, customerNoun = "customers" }: Props) {
  return (
    <table className="summary-table">
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Total profit p10</th>
          <th>Total profit p50</th>
          <th>Total profit p90</th>
          <th>End cash (p50)</th>
          <th>End {capitalize(customerNoun)} (p50)</th>
          <th>
            P(cash &lt; 0) <InfoTip text="The chance that cash drops below zero at some point during the simulation." />
          </th>
          <th>
            P(beats baseline){" "}
            <InfoTip text="The chance this scenario ends up more profitable than doing nothing (the baseline)." />
          </th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={r.scenario_name}>
            <td>{r.scenario_name}</td>
            <td>{formatMoney(r.summary.total_profit_p10)}</td>
            <td>{formatMoney(r.summary.total_profit_p50)}</td>
            <td>{formatMoney(r.summary.total_profit_p90)}</td>
            <td>{formatMoney(r.summary.end_cash_p50)}</td>
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
