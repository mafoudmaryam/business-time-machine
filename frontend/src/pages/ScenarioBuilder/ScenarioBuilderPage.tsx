import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createScenario,
  decisionOutToForm,
  listBusinesses,
  listScenarios,
  type DecisionFormValues,
  type ScenarioOut,
} from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import { DecisionForm } from "./DecisionForm";
import { DecisionList } from "./DecisionList";

function scenarioLabel(s: ScenarioOut): string {
  return s.parent_scenario_name ? `${s.name} (v. of ${s.parent_scenario_name})` : s.name;
}

export function ScenarioBuilderPage() {
  const [params, setParams] = useSearchParams();
  const businessId = params.get("business") ? Number(params.get("business")) : null;

  const businesses = useAsync(listBusinesses, []);
  const scenarios = useAsync(() => (businessId ? listScenarios(businessId) : Promise.resolve([])), [businessId]);

  const [name, setName] = useState("");
  const [parentScenarioId, setParentScenarioId] = useState<number | undefined>(undefined);
  const [decisions, setDecisions] = useState<DecisionFormValues[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  function selectBusiness(id: number) {
    setParams({ business: String(id) });
    resetForm();
  }

  function resetForm() {
    setName("");
    setParentScenarioId(undefined);
    setDecisions([]);
    setSubmitError(null);
    setSavedMessage(null);
  }

  function duplicateAsNewVersion(scenario: ScenarioOut) {
    setName(`${scenario.name} v2`);
    setParentScenarioId(scenario.id);
    setDecisions(scenario.decisions.map(decisionOutToForm));
    setSubmitError(null);
    setSavedMessage(null);
  }

  function addDecision(decision: DecisionFormValues) {
    setDecisions((d) => [...d, decision]);
  }

  function toggleConfirmed(index: number) {
    setDecisions((d) => d.map((dec, i) => (i === index ? { ...dec, confirmed: !dec.confirmed } : dec)));
  }

  function removeDecision(index: number) {
    setDecisions((d) => d.filter((_, i) => i !== index));
  }

  async function save() {
    if (!businessId) return;
    setSubmitting(true);
    setSubmitError(null);
    setSavedMessage(null);
    try {
      const created = await createScenario(businessId, name.trim(), decisions, parentScenarioId);
      setSavedMessage(`Saved "${created.name}".`);
      resetFormKeepBusiness();
      scenarios.reload();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function resetFormKeepBusiness() {
    setName("");
    setParentScenarioId(undefined);
    setDecisions([]);
  }

  const canSave = businessId !== null && name.trim().length > 0 && decisions.length > 0 && !submitting;

  return (
    <div className="page">
      <h1>Scenario builder</h1>

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
          <section>
            <h2>Existing scenarios</h2>
            {scenarios.loading && <Spinner label="Loading scenarios…" />}
            <ErrorBanner message={scenarios.error} />
            {scenarios.data && scenarios.data.length === 0 && <p className="empty-hint">No scenarios yet.</p>}
            {scenarios.data && scenarios.data.length > 0 && (
              <ul className="scenario-list">
                {scenarios.data.map((s) => (
                  <li key={s.id}>
                    <span>{scenarioLabel(s)}</span>
                    <button type="button" className="link-button" onClick={() => duplicateAsNewVersion(s)}>
                      Duplicate as new version
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>{parentScenarioId ? "New version" : "New scenario"}</h2>
            {parentScenarioId && (
              <p className="empty-hint">
                Based on{" "}
                {scenarios.data?.find((s) => s.id === parentScenarioId)?.name ?? `scenario #${parentScenarioId}`}
                . Edit the decisions below, then save.
              </p>
            )}

            <div className="field">
              <label htmlFor="scenario-name">Scenario name</label>
              <input
                id="scenario-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Raise prices 10% in March"
              />
            </div>

            <h3>Decisions</h3>
            <DecisionList decisions={decisions} onToggleConfirmed={toggleConfirmed} onRemove={removeDecision} />
            <DecisionForm onAdd={addDecision} />

            <ErrorBanner message={submitError} />
            {savedMessage && <p className="success-message">{savedMessage}</p>}

            <button type="button" onClick={save} disabled={!canSave}>
              {submitting ? "Saving…" : "Save scenario"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
