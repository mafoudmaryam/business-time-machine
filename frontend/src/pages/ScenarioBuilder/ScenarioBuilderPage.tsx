import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  createScenario,
  decisionOutToForm,
  listBusinesses,
  listIndustries,
  listScenarios,
  type DecisionFormValues,
  type ScenarioOut,
} from "../../api";
import { BusinessPicker } from "../../components/BusinessPicker";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PageHeading } from "../../components/PageHeading";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import { readBusinessId, withBusiness } from "../../lib/businessParam";
import type { ScenarioPrefill } from "../../lib/coachIdea";
import { decisionSummary } from "../../lib/decisionSummary";
import { DEFAULT_CURRENCY } from "../../lib/format";
import { saveBlocker } from "../../lib/scenarioDraft";
import { nextVersionName } from "../../lib/scenarioLabel";
import { DecisionForm } from "./DecisionForm";
import { DecisionList } from "./DecisionList";

export function ScenarioBuilderPage() {
  const [params, setParams] = useSearchParams();
  const businessId = readBusinessId(params);

  const businesses = useAsync(listBusinesses, []);
  const industries = useAsync(listIndustries, []);
  const scenarios = useAsync(() => (businessId ? listScenarios(businessId) : Promise.resolve([])), [businessId]);

  const selectedBusiness = businesses.data?.find((b) => b.id === businessId) ?? null;
  const industry = industries.data?.find((i) => i.id === selectedBusiness?.industry) ?? null;
  const currency = selectedBusiness?.currency ?? DEFAULT_CURRENCY;

  // "Try this idea" in the coach card arrives here with the idea already filled in. Every decision
  // is still unconfirmed: the owner reviews and confirms them before saving.
  const location = useLocation();
  const [prefill] = useState<ScenarioPrefill | undefined>(
    () => (location.state as { prefill?: ScenarioPrefill } | null)?.prefill,
  );

  const [name, setName] = useState(prefill?.name ?? "");
  const [parentScenarioId, setParentScenarioId] = useState<number | undefined>(prefill?.parentScenarioId);
  const [decisions, setDecisions] = useState<DecisionFormValues[]>(prefill?.decisions ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [fromCoach, setFromCoach] = useState(prefill !== undefined);

  function selectBusiness(id: number) {
    setParams({ business: String(id) });
    clearDraft();
    setSubmitError(null);
    setSavedName(null);
  }

  function clearDraft() {
    setName("");
    setParentScenarioId(undefined);
    setDecisions([]);
    setFromCoach(false);
  }

  function duplicateAsNewVersion(scenario: ScenarioOut) {
    setName(nextVersionName(scenario.name, (scenarios.data ?? []).map((s) => s.name)));
    setParentScenarioId(scenario.id);
    setDecisions(scenario.decisions.map(decisionOutToForm));
    setSubmitError(null);
    setSavedName(null);
    setFromCoach(false);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  function addDecision(decision: DecisionFormValues) {
    setDecisions((d) => [...d, decision]);
    setSavedName(null);
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
    setSavedName(null);
    try {
      const created = await createScenario(businessId, name.trim(), decisions, parentScenarioId);
      setSavedName(created.name);
      clearDraft();
      scenarios.reload();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const blocker = saveBlocker(name, decisions);
  const parentName = parentScenarioId
    ? (scenarios.data?.find((s) => s.id === parentScenarioId)?.name ?? `what-if #${parentScenarioId}`)
    : null;

  return (
    <div className="page">
      <PageHeading
        title="What if…?"
        subtitle="Build a what-if from one or more changes, check each step, then save it to compare later."
      />

      <BusinessPicker businesses={businesses} businessId={businessId} onSelect={selectBusiness} />

      {businessId && (
        <>
          {savedName && (
            <div className="success-banner" role="status">
              Saved “{savedName}”.{" "}
              <Link to={withBusiness("/compare", businessId)}>Compare it now →</Link>
            </div>
          )}

          {fromCoach && (
            <p className="info-banner">
              Your coach suggested this idea. Check each step in the recipe and tick “Confirm” before saving.
            </p>
          )}
          {parentName && !fromCoach && (
            <p className="info-banner">New version of “{parentName}”. Change what you like, then save.</p>
          )}

          <div className="builder-layout">
            <section className="card builder-main" aria-labelledby="build-title">
              <h2 id="build-title" className="card-title">
                {parentScenarioId ? "New version" : "New what-if"}
              </h2>
              <div className="field field-wide">
                <label htmlFor="scenario-name">Name</label>
                <input
                  id="scenario-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Raise prices 10% in month 3"
                />
                <p className="field-help">A short name you'll recognise on the Compare page.</p>
              </div>

              {!industry && <Spinner label="Loading business details…" />}
              {industry && (
                <DecisionForm
                  industryId={industry.id}
                  staffNoun={industry.staff_noun}
                  currency={currency}
                  onAdd={addDecision}
                />
              )}
            </section>

            <aside className="card recipe" aria-labelledby="recipe-title">
              <h2 id="recipe-title" className="card-title">
                The recipe
              </h2>
              <p className="recipe-name">{name.trim() || "Untitled what-if"}</p>
              {industry && (
                <DecisionList
                  decisions={decisions}
                  staffNoun={industry.staff_noun}
                  currency={currency}
                  onToggleConfirmed={toggleConfirmed}
                  onRemove={removeDecision}
                />
              )}
              <ErrorBanner message={submitError} />
              <button
                type="button"
                className="button-block"
                onClick={save}
                disabled={blocker !== null || submitting}
                aria-describedby="save-hint"
              >
                {submitting ? "Saving…" : "Save what-if"}
              </button>
              <p id="save-hint" className="hint">
                {blocker ?? "Ready to save."}
              </p>
              {decisions.length > 0 && (
                <button type="button" className="link-button" onClick={clearDraft}>
                  Start over
                </button>
              )}
            </aside>
          </div>

          <section aria-labelledby="saved-title">
            <h2 id="saved-title" className="section-title">
              Your saved what-ifs
            </h2>
            {scenarios.loading && <Spinner label="Loading what-ifs…" />}
            <ErrorBanner message={scenarios.error} />
            {scenarios.data && scenarios.data.length === 0 && <p className="empty-hint">None yet — build one above.</p>}
            {scenarios.data && scenarios.data.length > 0 && (
              <ul className="saved-grid">
                {scenarios.data.map((s) => (
                  <li key={s.id} className="saved-card">
                    <h3>{s.name}</h3>
                    {s.parent_scenario_name && <p className="saved-parent">Version of “{s.parent_scenario_name}”</p>}
                    <ul className="saved-steps">
                      {s.decisions.map((d) => (
                        <li key={d.id}>
                          {decisionSummary(decisionOutToForm(d), industry?.staff_noun, currency)}
                          {!d.confirmed && <span className="needs-confirmation"> (not confirmed)</span>}
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="button-secondary" onClick={() => duplicateAsNewVersion(s)}>
                      Make a new version
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
