import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  confirmScenario,
  listBusinesses,
  listIndustries,
  listScenarios,
  simulateBusiness,
  type SimulationRunOut,
} from "../../api";
import { CoachCard } from "../../components/CoachCard";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Spinner } from "../../components/Spinner";
import { MAX_SCENARIOS_PER_RUN } from "../../constants";
import { useAsync } from "../../hooks/useAsync";
import { DEFAULT_CURRENCY, capitalize } from "../../lib/format";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { heroImage } from "../../lib/images";
import { ChartCaption } from "./ChartCaption";
import { MetricChart } from "./MetricChart";
import { RiskAlerts } from "./RiskAlert";
import { RunMeta } from "./RunMeta";
import { ScenarioPicker } from "./ScenarioPicker";
import { SummaryTable } from "./SummaryTable";

const HORIZONS = [12, 24, 36];

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

export function ComparisonDashboardPage() {
  const [params, setParams] = useSearchParams();
  const businessId = params.get("business") ? Number(params.get("business")) : null;

  const businesses = useAsync(listBusinesses, []);
  const industries = useAsync(listIndustries, []);
  const scenarios = useAsync(() => (businessId ? listScenarios(businessId) : Promise.resolve([])), [businessId]);

  const selectedBusiness = businesses.data?.find((b) => b.id === businessId) ?? null;
  const industry = industries.data?.find((i) => i.id === selectedBusiness?.industry) ?? null;
  const customerNoun = industry?.customer_noun ?? "customers";
  const charts = buildCharts(customerNoun);

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

  /** "Looks right": confirm on the server, refresh the list, and tick the card (if there is room). */
  async function confirmAndPick(id: number) {
    await confirmScenario(id);
    scenarios.reload();
    setSelectedIds((ids) => (ids.includes(id) || ids.length >= MAX_SCENARIOS_PER_RUN ? ids : [...ids, id]));
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
      {industry && (
        <div className="hero-banner" style={{ backgroundImage: `url(${heroImage(industry.id, "compare")})` }}>
          <h1>Comparison dashboard</h1>
        </div>
      )}
      {!industry && <h1>Comparison dashboard</h1>}

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
            {scenarios.loading && <Spinner label="Loading scenarios…" />}
            <ErrorBanner message={scenarios.error} />
            {scenarios.data && scenarios.data.length === 0 && (
              <p className="empty-hint">This business has no scenarios yet.</p>
            )}
            {scenarios.data && scenarios.data.length > 0 && (
              <ScenarioPicker
                scenarios={scenarios.data}
                businessId={businessId}
                staffNoun={industry?.staff_noun ?? "staff member"}
                currency={selectedBusiness?.currency ?? DEFAULT_CURRENCY}
                selectedIds={selectedIds}
                onToggle={toggleScenario}
                onConfirm={confirmAndPick}
              />
            )}
          </div>

          <div className="field">
            <label htmlFor="horizon-select">Months to simulate</label>
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
              <CoachCard
                key={run.id}
                runId={run.id}
                businessId={run.business_id}
                currency={selectedBusiness?.currency ?? DEFAULT_CURRENCY}
              />
              <RiskAlerts results={run.results} />
              <ChartCaption />
              <div className="chart-grid">
                {charts.map((c) => (
                  <MetricChart
                    key={c.metric}
                    title={c.title}
                    tooltip={c.tooltip}
                    metric={c.metric}
                    results={run.results}
                    isMoney={c.isMoney}
                    currency={selectedBusiness?.currency ?? DEFAULT_CURRENCY}
                  />
                ))}
              </div>
              <SummaryTable
                results={run.results}
                customerNoun={customerNoun}
                currency={selectedBusiness?.currency ?? DEFAULT_CURRENCY}
              />
              <RunMeta run={run} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
