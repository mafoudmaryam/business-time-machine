import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listBusinesses, listScenarios, simulateBusiness, type SimulationRunOut } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Spinner } from "../../components/Spinner";
import { MAX_SCENARIOS_PER_RUN } from "../../constants";
import { useAsync } from "../../hooks/useAsync";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { ChartCaption } from "./ChartCaption";
import { MetricChart } from "./MetricChart";
import { RiskAlerts } from "./RiskAlert";
import { RunMeta } from "./RunMeta";
import { SummaryTable } from "./SummaryTable";

const HORIZONS = [12, 24, 36];
const CHARTS: { metric: string; title: string; isMoney: boolean }[] = [
  { metric: "revenue", title: "Revenue", isMoney: true },
  { metric: "profit", title: "Profit", isMoney: true },
  { metric: "cash", title: "Cash", isMoney: true },
  { metric: "customers", title: "Customers", isMoney: false },
];

export function ComparisonDashboardPage() {
  const [params, setParams] = useSearchParams();
  const businessId = params.get("business") ? Number(params.get("business")) : null;

  const businesses = useAsync(listBusinesses, []);
  const scenarios = useAsync(() => (businessId ? listScenarios(businessId) : Promise.resolve([])), [businessId]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [horizon, setHorizon] = useState(24);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [run, setRun] = useState<SimulationRunOut | null>(null);

  function selectBusiness(id: number) {
    setParams({ business: String(id) });
    setSelectedIds([]);
    setRun(null);
    setRunError(null);
  }

  function toggleScenario(id: number) {
    setSelectedIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= MAX_SCENARIOS_PER_RUN) return ids;
      return [...ids, id];
    });
  }

  async function runSimulation() {
    if (!businessId || selectedIds.length === 0) return;
    setRunning(true);
    setRunError(null);
    try {
      const result = await simulateBusiness(businessId, selectedIds, horizon);
      setRun(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRunError(friendlyErrorMessage(message));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page">
      <h1>Comparison dashboard</h1>

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
          <div className="field">
            <span>Scenarios to compare (up to {MAX_SCENARIOS_PER_RUN}, baseline is always included)</span>
            {scenarios.loading && <Spinner label="Loading scenarios…" />}
            <ErrorBanner message={scenarios.error} />
            {scenarios.data && scenarios.data.length === 0 && (
              <p className="empty-hint">This business has no scenarios yet.</p>
            )}
            {scenarios.data && scenarios.data.length > 0 && (
              <ul className="scenario-checklist">
                {scenarios.data.map((s) => {
                  const needsConfirmation = s.decisions.some((d) => !d.confirmed);
                  return (
                    <li key={s.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(s.id)}
                          disabled={
                            needsConfirmation ||
                            (!selectedIds.includes(s.id) && selectedIds.length >= MAX_SCENARIOS_PER_RUN)
                          }
                          onChange={() => toggleScenario(s.id)}
                        />
                        {s.name}
                      </label>
                      {needsConfirmation && (
                        <span className="needs-confirmation">
                          {" "}
                          needs confirmation --{" "}
                          <Link to={`/scenarios?business=${businessId}`}>confirm in scenario builder</Link>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="field">
            <label htmlFor="horizon-select">Horizon</label>
            <select id="horizon-select" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {h} months
                </option>
              ))}
            </select>
          </div>

          <button type="button" onClick={runSimulation} disabled={selectedIds.length === 0 || running}>
            {running ? "Running…" : "Run simulation"}
          </button>

          <ErrorBanner message={runError} />

          {run && (
            <section className="run-results">
              <RiskAlerts results={run.results} />
              <ChartCaption />
              <div className="chart-grid">
                {CHARTS.map((c) => (
                  <MetricChart key={c.metric} title={c.title} metric={c.metric} results={run.results} isMoney={c.isMoney} />
                ))}
              </div>
              <SummaryTable results={run.results} />
              <RunMeta run={run} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
