import { SavedResultExplanation } from "../../components/ResultExplanation";
import { ResultAssumptions } from "../../components/ResultAssumptions";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  confirmScenario,
  listBusinesses,
  listIndustries,
  listScenarios,
  simulateBusiness,
  type SimulationRunOut,
} from "../../api";
import { CoachCard } from "../../components/CoachCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { LoadError } from "../../components/LoadError";
import { Spinner } from "../../components/Spinner";
import { useDeleteFlow } from "../../components/useDeleteFlow";
import { MAX_SCENARIOS_PER_RUN } from "../../constants";
import { useAsync } from "../../hooks/useAsync";
import { DEFAULT_CURRENCY, capitalize } from "../../lib/format";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { rememberBusiness } from "../../lib/session";
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

  const selection = `${businessId}:${horizon}:${[...selectedIds].sort().join(",")}`;
  const latestSelection = useRef(selection);
  useEffect(() => { latestSelection.current = selection; }, [selection]);
  const [completedSelection, setCompletedSelection] = useState("");
  const currentRun = !running && completedSelection === selection && run?.business_id === businessId ? run : null;

  const resultCurrency = currentRun?.results.find(r => r.summary.explanation_context)?.summary.explanation_context?.currency ?? selectedBusiness?.currency ?? DEFAULT_CURRENCY;

  function selectBusiness(id: number) {
    rememberBusiness(id);
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

  const deleteFlow = useDeleteFlow();

  /** "Looks right": confirm on the server, refresh the list, and tick the card (if there is room). */
  async function confirmAndPick(id: number) {
    await confirmScenario(id);
    scenarios.reload();
    setSelectedIds((ids) => (ids.includes(id) || ids.length >= MAX_SCENARIOS_PER_RUN ? ids : [...ids, id]));
  }

  async function runSimulation() {
    if (!businessId || selectedIds.length === 0) return;
    const requestedSelection = selection;
    setRunning(true);
    setRun(null);
    setRunError(null);
    try {
      const result = await simulateBusiness(businessId, selectedIds, horizon);
      if (latestSelection.current === requestedSelection) { setRun(result); setCompletedSelection(requestedSelection); }
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
          <h1>Compare plans</h1>
        </div>
      )}
      {!industry && <h1>Compare plans</h1>}

      <p className="try-lead">Choose saved ideas to compare with changing nothing. Look at the trade-offs before deciding what matters to you.</p>

      <div className="field">
        <label htmlFor="business-select">Business</label>
        {businesses.loading && <Spinner label="Loading businesses…" />}
        {businesses.error && <LoadError message={businesses.error} what="your businesses" onRetry={businesses.reload} />}
        {businesses.data && businesses.data.length > 0 && (
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

      {businesses.data && businesses.data.length === 0 && (
        <EmptyState title="No businesses yet" action={{ label: "Set up a business", to: "/" }}>
          <p>Add your café, restaurant or bakery first. It takes about a minute.</p>
        </EmptyState>
      )}

      {businessId && (
        <>
          <div className="field">
            {scenarios.loading && <Spinner label="Loading scenarios…" />}
            {scenarios.error && <LoadError message={scenarios.error} what="your scenarios" onRetry={scenarios.reload} />}
            {scenarios.data && scenarios.data.length === 0 && (
              <EmptyState
                title="No scenarios yet"
                action={{ label: "Try an idea", to: "/explore" }}
                secondary={{ label: "Describe one in your own words", to: "/scenarios" }}
              >
                <p>A scenario is one idea you want to test, like raising your prices. Try one and it will appear here, ready to compare.</p>
              </EmptyState>
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
                onDelete={(s) =>
                  deleteFlow.ask({
                    kind: "scenario",
                    id: s.id,
                    name: s.name,
                    onDone: () => {
                      setSelectedIds((ids) => ids.filter((x) => x !== s.id));
                      scenarios.reload();
                    },
                    onUndone: () => scenarios.reload(),
                  })
                }
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
            {running ? "Comparing…" : "Compare plans"}
          </button>

          <ErrorBanner message={runError} />

          {currentRun && (
            <section className="run-results">
              <SavedResultExplanation key={currentRun.id} run={currentRun} currency={resultCurrency} />
              <details className="result-explanation-details"><summary>See the numbers</summary>
              <ResultAssumptions />
              <details><summary>Optional coach and ideas</summary>
              <CoachCard
                key={currentRun.id}
                runId={currentRun.id}
                businessId={currentRun.business_id}
                currency={resultCurrency}
              />
              </details>
              <RiskAlerts results={currentRun.results} />
              <ChartCaption />
              <div className="chart-grid">
                {charts.map((c) => (
                  <MetricChart
                    key={c.metric}
                    title={c.title}
                    tooltip={c.tooltip}
                    metric={c.metric}
                    results={currentRun.results}
                    isMoney={c.isMoney}
                    currency={resultCurrency}
                  />
                ))}
              </div>
              <SummaryTable
                results={currentRun.results}
                customerNoun={customerNoun}
                currency={resultCurrency}
              />
              <RunMeta run={currentRun} />
              </details>
              <p className="result-links">
                <Link to="/how" onClick={() => rememberBusiness(currentRun.business_id)}>Inputs and assumptions</Link> ·{" "}
                <Link to={`/share?run=${currentRun.id}`} onClick={() => rememberBusiness(currentRun.business_id)}>Print or save PDF</Link>
              </p>
            </section>
          )}
        </>
      )}
      {deleteFlow.dialog}
    </div>
  );
}
