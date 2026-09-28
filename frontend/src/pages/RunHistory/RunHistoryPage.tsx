import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getSimulationRun, listBusinesses, listIndustries, listSimulationRuns, type SimulationRunOut } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import { DEFAULT_CURRENCY, capitalize } from "../../lib/format";
import { displayScenarioName } from "../../lib/scenarioLabel";
import { ChartCaption } from "../Comparison/ChartCaption";
import { MetricChart } from "../Comparison/MetricChart";
import { RiskAlerts } from "../Comparison/RiskAlert";
import { RunMeta } from "../Comparison/RunMeta";
import { SummaryTable } from "../Comparison/SummaryTable";

function buildCharts(customerNoun: string): { metric: string; title: string; tooltip: string; isMoney: boolean }[] {
  return [
    { metric: "revenue", title: "Revenue", tooltip: "Total sales before any costs are taken out.", isMoney: true },
    { metric: "profit", title: "Profit", tooltip: "What's left after every cost is paid.", isMoney: true },
    { metric: "cash", title: "Cash", tooltip: "Money actually in the bank, month by month.", isMoney: true },
    {
      metric: "customers",
      title: capitalize(customerNoun),
      tooltip: `How many ${customerNoun} keep coming back, month by month.`,
      isMoney: false,
    },
  ];
}

export function RunHistoryPage() {
  const [params, setParams] = useSearchParams();
  const businessId = params.get("business") ? Number(params.get("business")) : null;

  const businesses = useAsync(listBusinesses, []);
  const industries = useAsync(listIndustries, []);
  const runs = useAsync(() => (businessId ? listSimulationRuns(businessId) : Promise.resolve([])), [businessId]);

  const selectedBusiness = businesses.data?.find((b) => b.id === businessId) ?? null;
  const industry = industries.data?.find((i) => i.id === selectedBusiness?.industry) ?? null;
  const customerNoun = industry?.customer_noun ?? "customers";
  const currency = selectedBusiness?.currency ?? DEFAULT_CURRENCY;
  const charts = buildCharts(customerNoun);

  const [openedRun, setOpenedRun] = useState<SimulationRunOut | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);

  function selectBusiness(id: number) {
    setParams({ business: String(id) });
    setOpenedRun(null);
    setOpenError(null);
  }

  async function openRun(id: number) {
    setOpeningId(id);
    setOpenError(null);
    try {
      const run = await getSimulationRun(id);
      setOpenedRun(run);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="page">
      <h1>Run history</h1>

      <div className="field">
        <label htmlFor="business-select">Business</label>
        {businesses.loading && <Spinner label="Loading businesses…" />}
        <ErrorBanner message={businesses.error} />
        {businesses.data && (
          <select
            id="business-select"
            value={businessId ?? ""}
            onChange={(e) => selectBusiness(Number(e.target.value))}
          >
            <option value="" disabled>
              Choose a business…
            </option>
            {businesses.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {businessId && (
        <>
          {runs.loading && <Spinner label="Loading run history…" />}
          <ErrorBanner message={runs.error} />
          {runs.data && runs.data.length === 0 && <p className="empty-hint">No simulation runs yet.</p>}
          {runs.data && runs.data.length > 0 && (
            <table className="run-history-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Created</th>
                  <th>Months simulated</th>
                  <th>Scenarios</th>
                  <th>Seed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.horizon} months</td>
                    <td>{r.scenario_names.map(displayScenarioName).join(", ")}</td>
                    <td>{r.seed}</td>
                    <td>
                      <button type="button" className="link-button" onClick={() => openRun(r.id)}>
                        {openingId === r.id ? "Opening…" : "Reopen"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <ErrorBanner message={openError} />

          {openedRun && (
            <section className="run-results">
              <h2>Run #{openedRun.id}</h2>
              <RiskAlerts results={openedRun.results} />
              <ChartCaption />
              <div className="chart-grid">
                {charts.map((c) => (
                  <MetricChart
                    key={c.metric}
                    title={c.title}
                    tooltip={c.tooltip}
                    metric={c.metric}
                    results={openedRun.results}
                    isMoney={c.isMoney}
                    currency={currency}
                  />
                ))}
              </div>
              <SummaryTable results={openedRun.results} customerNoun={customerNoun} currency={currency} />
              <RunMeta run={openedRun} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
