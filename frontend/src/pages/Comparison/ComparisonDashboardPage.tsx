import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  decisionOutToForm,
  listBusinesses,
  listIndustries,
  listScenarios,
  simulateBusiness,
  type SimulationRunOut,
} from "../../api";
import { BusinessPicker } from "../../components/BusinessPicker";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PageHeading } from "../../components/PageHeading";
import { Spinner } from "../../components/Spinner";
import { MAX_SCENARIOS_PER_RUN } from "../../constants";
import { useAsync } from "../../hooks/useAsync";
import { readBusinessId, withBusiness } from "../../lib/businessParam";
import { decisionSummary } from "../../lib/decisionSummary";
import { DEFAULT_CURRENCY } from "../../lib/format";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { heroImage } from "../../lib/images";
import { RunResults } from "./RunResults";

const HORIZONS = [12, 24, 36];

export function ComparisonDashboardPage() {
  const [params, setParams] = useSearchParams();
  const businessId = readBusinessId(params);

  const businesses = useAsync(listBusinesses, []);
  const industries = useAsync(listIndustries, []);
  const scenarios = useAsync(() => (businessId ? listScenarios(businessId) : Promise.resolve([])), [businessId]);

  const selectedBusiness = businesses.data?.find((b) => b.id === businessId) ?? null;
  const industry = industries.data?.find((i) => i.id === selectedBusiness?.industry) ?? null;
  const customerNoun = industry?.customer_noun ?? "customers";
  const currency = selectedBusiness?.currency ?? DEFAULT_CURRENCY;

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

  const full = selectedIds.length >= MAX_SCENARIOS_PER_RUN;

  return (
    <div className="page">
      <PageHeading
        title="Compare possible futures"
        subtitle="Pick up to three what-ifs and see how each one plays out against changing nothing."
        image={industry ? heroImage(industry.id, "compare") : undefined}
      />

      <BusinessPicker businesses={businesses} businessId={businessId} onSelect={selectBusiness} />

      {businessId && (
        <div className="card run-setup">
          <fieldset className="plain-fieldset">
            <legend className="step-title">
              <span className="step-badge">1</span> Choose what-ifs to compare
              <span className="step-hint">
                {selectedIds.length} of {MAX_SCENARIOS_PER_RUN} chosen · "If you change nothing" is always included
              </span>
            </legend>

            {scenarios.loading && <Spinner label="Loading what-ifs…" />}
            <ErrorBanner message={scenarios.error} />
            {scenarios.data && scenarios.data.length === 0 && (
              <div className="empty-state">
                <p>This business has no what-ifs yet.</p>
                <Link to={withBusiness("/scenarios", businessId)} className="button">
                  Create your first what-if
                </Link>
              </div>
            )}
            {scenarios.data && scenarios.data.length > 0 && (
              <ul className="pick-grid">
                {scenarios.data.map((s) => {
                  const needsConfirmation = s.decisions.some((d) => !d.confirmed);
                  const checked = selectedIds.includes(s.id);
                  const disabled = needsConfirmation || (!checked && full);
                  return (
                    <li key={s.id}>
                      <label className={`pick-card${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleScenario(s.id)}
                        />
                        <span className="pick-card-body">
                          <span className="pick-card-title">{s.name}</span>
                          <span className="pick-card-detail">
                            {s.decisions
                              .map((d) => decisionSummary(decisionOutToForm(d), industry?.staff_noun, currency))
                              .join(" · ")}
                          </span>
                        </span>
                      </label>
                      {needsConfirmation && (
                        <p className="needs-confirmation">
                          Not confirmed yet —{" "}
                          <Link to={withBusiness("/scenarios", businessId)}>confirm it in What-ifs</Link>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          <fieldset className="plain-fieldset">
            <legend className="step-title">
              <span className="step-badge">2</span> How far ahead?
            </legend>
            <div className="pill-group" role="radiogroup" aria-label="Months to simulate">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={horizon === h}
                  className={horizon === h ? "pill is-on" : "pill"}
                  onClick={() => setHorizon(h)}
                >
                  {h} months
                </button>
              ))}
            </div>
          </fieldset>

          <div className="run-actions">
            <button
              type="button"
              className="button-large"
              onClick={runSimulation}
              disabled={selectedIds.length === 0 || running}
            >
              {running ? "Simulating 1,000 futures…" : run ? "Run again" : "See what happens"}
            </button>
            {selectedIds.length === 0 && scenarios.data && scenarios.data.length > 0 && (
              <span className="hint">Choose at least one what-if first.</span>
            )}
          </div>
          <ErrorBanner message={runError} />
        </div>
      )}

      {run && <RunResults run={run} currency={currency} customerNoun={customerNoun} />}
    </div>
  );
}
