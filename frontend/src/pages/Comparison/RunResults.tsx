import type { SimulationRunOut } from "../../api";
import { CoachCard } from "../../components/CoachCard";
import { capitalize } from "../../lib/format";
import { ChartCaption } from "./ChartCaption";
import { ChartLegend, MetricChart } from "./MetricChart";
import { ResultCards } from "./ResultCards";
import { RiskAlerts } from "./RiskAlert";
import { RunMeta } from "./RunMeta";
import { SummaryTable } from "./SummaryTable";

interface Props {
  run: SimulationRunOut;
  currency: string;
  customerNoun: string;
}

/** Everything shown after a simulation: result cards, risk alerts, the coach, charts
 * and the full table. Compare and Past results both show exactly this, so it lives
 * in one component instead of two copies. */
export function RunResults({ run, currency, customerNoun }: Props) {
  const charts = [
    { metric: "revenue", title: "Sales", tooltip: "Total sales before any costs are taken out.", isMoney: true },
    { metric: "cash", title: "Cash in the bank", tooltip: "Money actually in the bank, month by month.", isMoney: true },
    {
      metric: "customers",
      title: capitalize(customerNoun),
      tooltip: `How many ${customerNoun} keep coming back, month by month.`,
      isMoney: false,
    },
  ];

  return (
    <section className="run-results" aria-label="Results">
      <h2 className="section-title">At a glance</h2>
      <p className="section-subtitle">Total over {run.horizon} months, from 1,000 simulated futures.</p>
      <ResultCards results={run.results} currency={currency} />
      <RiskAlerts results={run.results} />

      <CoachCard key={run.id} runId={run.id} businessId={run.business_id} currency={currency} />

      <h2 className="section-title">Month by month</h2>
      <ChartCaption />
      <ChartLegend results={run.results} />
      <div className="chart-grid">
        <div className="chart-featured">
          <MetricChart
            title="Profit each month"
            tooltip="What's left after every cost is paid."
            metric="profit"
            results={run.results}
            isMoney
            currency={currency}
            height={300}
          />
        </div>
        {charts.map((c) => (
          <MetricChart
            key={c.metric}
            title={c.title}
            tooltip={c.tooltip}
            metric={c.metric}
            results={run.results}
            isMoney={c.isMoney}
            currency={currency}
          />
        ))}
      </div>

      <details className="table-details">
        <summary>See all the numbers in a table</summary>
        <div className="table-scroll">
          <SummaryTable results={run.results} customerNoun={customerNoun} currency={currency} />
        </div>
      </details>
      <RunMeta run={run} />
    </section>
  );
}
