import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  createScenario,
  decisionOutToForm,
  listBusinesses,
  listIndustries,
  listScenarios,
  logInterpretOutcome,
  type DecisionFormValues,
  type Interpretation,
  type ScenarioOut,
} from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import type { ScenarioPrefill } from "../../lib/coachIdea";
import { DEFAULT_CURRENCY } from "../../lib/format";
import { applyEdit, stepsFromInterpretation, suggestName, type StepItem } from "../../lib/interpretView";
import { nextVersionName } from "../../lib/scenarioLabel";
import { DecisionForm } from "./DecisionForm";
import { DecisionList } from "./DecisionList";
import { DescribeBox } from "./DescribeBox";

function scenarioLabel(s: ScenarioOut): string {
  return s.parent_scenario_name ? `${s.name} (v. of ${s.parent_scenario_name})` : s.name;
}

export function ScenarioBuilderPage() {
  const [params, setParams] = useSearchParams();
  const businessId = params.get("business") ? Number(params.get("business")) : null;

  const businesses = useAsync(listBusinesses, []);
  const industries = useAsync(listIndustries, []);
  const scenarios = useAsync(() => (businessId ? listScenarios(businessId) : Promise.resolve([])), [businessId]);

  const selectedBusiness = businesses.data?.find((b) => b.id === businessId) ?? null;
  const industry = industries.data?.find((i) => i.id === selectedBusiness?.industry) ?? null;

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
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [fromCoach, setFromCoach] = useState(prefill !== undefined);
  // The reading of the owner's own words that the current steps came from (for the thesis measure).
  const [interpretationId, setInterpretationId] = useState<number | null>(null);

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
    setFromCoach(false);
    setInterpretationId(null);
  }

  function duplicateAsNewVersion(scenario: ScenarioOut) {
    setName(nextVersionName(scenario.name, (scenarios.data ?? []).map((s) => s.name)));
    setParentScenarioId(scenario.id);
    setDecisions(scenario.decisions.map(decisionOutToForm));
    setSubmitError(null);
    setSavedMessage(null);
    setFromCoach(false);
    setInterpretationId(null);
  }

  // "Edit" on the Compare page arrives with ?duplicate=<id>: open that scenario here as a new version.
  const duplicateId = params.get("duplicate") ? Number(params.get("duplicate")) : null;
  const handledDuplicate = useRef<number | null>(null);
  useEffect(() => {
    if (duplicateId === null || handledDuplicate.current === duplicateId || !scenarios.data) return;
    const found = scenarios.data.find((s) => s.id === duplicateId);
    handledDuplicate.current = duplicateId;
    if (found) duplicateAsNewVersion(found);
    setParams({ business: String(businessId) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateId, scenarios.data]);

  function addDecision(decision: DecisionFormValues) {
    setDecisions((d) => [...d, decision]);
  }

  function setConfirmed(indexes: number[], confirmed: boolean) {
    setDecisions((d) => d.map((dec, i) => (indexes.includes(i) ? { ...dec, confirmed } : dec)));
  }

  function removeDecisions(indexes: number[]) {
    setDecisions((d) => d.filter((_, i) => !indexes.includes(i)));
  }

  function editStep(item: StepItem, edited: DecisionFormValues, endMonth: number | null) {
    setDecisions((d) => applyEdit(d, item, edited, endMonth));
  }

  /** The steps from the owner's own words arrive UNCONFIRMED. Reading again (after answering a question)
   * replaces the earlier reading's steps; steps added by hand stay. */
  function takeInterpretation(result: Interpretation) {
    setDecisions((d) => [...d.filter((x) => !x.origin), ...stepsFromInterpretation(result)]);
    setInterpretationId(result.id);
    setSavedMessage(null);
    setName((n) => (n.trim() ? n : suggestName(result.text)));
  }

  async function save() {
    if (!businessId) return;
    setSubmitting(true);
    setSubmitError(null);
    setSavedMessage(null);
    try {
      const created = await createScenario(businessId, name.trim(), decisions, parentScenarioId);
      if (interpretationId !== null) {
        // What the owner kept, edited or added after the AI's steps. Fire and forget: never blocks saving.
        logInterpretOutcome(interpretationId, decisions, created.id).catch(() => undefined);
      }
      setSavedMessage(`Saved "${created.name}".`);
      resetFormKeepBusiness();
      setFromCoach(false);
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
    setInterpretationId(null);
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
            {fromCoach && (
              <p className="empty-hint">
                Your coach suggested this idea. Check each decision below and tick "confirm" before saving.
              </p>
            )}
            {parentScenarioId && !fromCoach && (
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

            {!industry && <Spinner label="Loading business details…" />}
            {industry && (
              <DescribeBox
                businessId={businessId}
                staffNoun={industry.staff_noun}
                currency={selectedBusiness?.currency ?? DEFAULT_CURRENCY}
                onInterpreted={takeInterpretation}
              />
            )}

            <h3>Decisions</h3>
            {industry && (
              <>
                <DecisionList
                  decisions={decisions}
                  industryId={industry.id}
                  staffNoun={industry.staff_noun}
                  currency={selectedBusiness?.currency ?? DEFAULT_CURRENCY}
                  onSetConfirmed={setConfirmed}
                  onRemove={removeDecisions}
                  onEdit={editStep}
                />
                <DecisionForm
                  industryId={industry.id}
                  staffNoun={industry.staff_noun}
                  currency={selectedBusiness?.currency ?? DEFAULT_CURRENCY}
                  onAdd={addDecision}
                />
              </>
            )}

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
