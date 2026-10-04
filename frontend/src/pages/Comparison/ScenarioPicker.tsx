import { useState } from "react";
import { Link } from "react-router-dom";
import type { ScenarioOut } from "../../api";
import { MAX_SCENARIOS_PER_RUN } from "../../constants";
import { needsCheck, scenarioSentences, splitVersions } from "../../lib/scenarioPicker";

const FULL_TIP = "You can compare up to 3 at a time";

interface Props {
  scenarios: ScenarioOut[];
  businessId: number;
  staffNoun: string;
  currency: string;
  selectedIds: number[];
  onToggle: (id: number) => void;
  /** Marks the scenario's decisions confirmed on the server; the page then ticks the card. */
  onConfirm: (id: number) => Promise<void>;
  /** Asks to delete a scenario (the page shows the "Are you sure?" box and the Undo message). */
  onDelete?: (scenario: ScenarioOut) => void;
}

/** Scenario cards for the Compare page. Choosing is one tick; a scenario whose decisions the owner has not
 * confirmed yet shows "Check & add", which lists them in plain words so they can confirm with one click. */
export function ScenarioPicker({ scenarios, businessId, staffNoun, currency, selectedIds, onToggle, onConfirm, onDelete }: Props) {
  const [showOlder, setShowOlder] = useState(false);
  const [checking, setChecking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = selectedIds.length >= MAX_SCENARIOS_PER_RUN;
  const { latest, older } = splitVersions(scenarios);

  async function confirm(id: number) {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(id);
      setChecking(null);
    } catch {
      setError("We couldn't save that just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function card(s: ScenarioOut) {
    const sentences = scenarioSentences(s, staffNoun, currency);
    const chosen = selectedIds.includes(s.id);
    const unchecked = needsCheck(s);
    const disabled = !chosen && full;
    const panelId = `check-panel-${s.id}`;
    return (
      <li key={s.id} className={`pick-card${chosen ? " pick-card-chosen" : ""}`}>
        <div className="pick-card-top">
          {unchecked ? (
            <span className="pick-name">{s.name}</span>
          ) : (
            <label className="pick-label" title={disabled ? FULL_TIP : undefined}>
              <input
                type="checkbox"
                checked={chosen}
                disabled={disabled}
                aria-describedby={disabled ? "pick-full-tip" : undefined}
                onChange={() => onToggle(s.id)}
              />
              <span className="pick-name">{s.name}</span>
            </label>
          )}
          {unchecked && (
            <button
              type="button"
              className="pick-check"
              aria-expanded={checking === s.id}
              aria-controls={panelId}
              onClick={() => {
                setError(null);
                setChecking(checking === s.id ? null : s.id);
              }}
            >
              Check &amp; add
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="link-button pick-delete"
              aria-label={`Delete ${s.name}`}
              onClick={() => onDelete(s)}
            >
              Delete
            </button>
          )}
        </div>
        <p className="pick-summary">{sentences.join(" · ")}</p>
        {unchecked && checking === s.id && (
          <div className="pick-panel" id={panelId} role="group" aria-label={`Check ${s.name}`}>
            <p className="pick-panel-title">This scenario will:</p>
            <ul>
              {sentences.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="pick-panel-actions">
              <button type="button" onClick={() => void confirm(s.id)} disabled={busy}>
                {busy ? "Saving…" : "Looks right"}
              </button>
              <Link className="pick-edit" to={`/scenarios?business=${businessId}&duplicate=${s.id}`}>
                Edit
              </Link>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="scenario-picker">
      <h2 className="pick-heading">
        Pick up to {MAX_SCENARIOS_PER_RUN}
        <span className="pick-counter" role="status" aria-live="polite">
          {selectedIds.length} of {MAX_SCENARIOS_PER_RUN} chosen
        </span>
      </h2>
      <span id="pick-full-tip" className="visually-hidden">
        {FULL_TIP}
      </span>
      <ul className="pick-grid">
        <li className="pick-card pick-card-base">
          <div className="pick-card-top">
            <span className="pick-name">If you change nothing</span>
            <span className="pick-always">Always included</span>
          </div>
        </li>
        {latest.map(card)}
      </ul>
      {older.length > 0 && (
        <>
          <button type="button" className="link-button" aria-expanded={showOlder} onClick={() => setShowOlder((v) => !v)}>
            {showOlder ? "Hide older versions" : `Show older versions (${older.length})`}
          </button>
          {showOlder && <ul className="pick-grid">{older.map(card)}</ul>}
        </>
      )}
    </div>
  );
}
