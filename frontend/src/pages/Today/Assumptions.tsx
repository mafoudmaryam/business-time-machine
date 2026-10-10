import { useState } from "react";
import { changeNumbers, type Assumption } from "../../api";
import { NumberField } from "../../components/NumberField";
import { track } from "../../lib/events";
import { apiValue, entryValue, formatAssumptionValue, validateAssumption } from "../../lib/todayView";

interface Props {
  businessId: number;
  currency: string;
  industryName: string;
  assumptions: Assumption[];
  isSample: boolean;
  /** A practice business from the start-up guide has local-currency numbers, so the "US dollars" notice does not apply. */
  fromGuide?: boolean;
  onChanged: () => void;
}

/** "What we assumed": every number the app guessed for this owner, in plain words, each one editable. */
export function Assumptions({ businessId, currency, industryName, assumptions, isSample, fromGuide = false, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState(NaN);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (assumptions.length === 0) return null;
  const main = assumptions.filter((a) => a.important);
  const rest = assumptions.filter((a) => !a.important);
  const dollars = currency !== "USD" && !fromGuide;

  function start(a: Assumption) {
    setEditing(a.field);
    setValue(entryValue(a));
    setError(null);
    track("assumption_edit_open", "today", { field: a.field });
  }

  async function save(a: Assumption) {
    const problem = validateAssumption(a, value);
    setError(problem);
    if (problem) return;
    setSaving(true);
    try {
      await changeNumbers(businessId, { [a.field]: apiValue(a, value) });
      track("assumption_changed", "today", { field: a.field });
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function row(a: Assumption) {
    const isEditing = editing === a.field;
    const highlight = dollars && a.unit === "money" && a.field !== "fixed_costs";
    return (
      <li key={a.field} className={highlight ? "assumed-row assumed-row-flag" : "assumed-row"}>
        {isEditing ? (
          <div className="assumed-edit">
            <NumberField
              label={a.label}
              help={a.rule}
              unit={a.unit === "percent" ? "%" : a.unit === "money" ? currency : ""}
              value={value}
              onChange={setValue}
              error={error ?? undefined}
            />
            <div className="assumed-actions">
              <button type="button" disabled={saving} onClick={() => void save(a)}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" className="secondary" disabled={saving} onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="assumed-label">
                {a.label}: <strong>{formatAssumptionValue(a, currency)}</strong>
              </p>
              <p className="assumed-rule">{a.rule}</p>
            </div>
            <button type="button" className="link-button" onClick={() => start(a)} aria-label={`Change ${a.label}`}>
              Change
            </button>
          </>
        )}
      </li>
    );
  }

  return (
    <section className="assumed-panel" id="assumed" aria-labelledby="assumed-title">
      <h2 id="assumed-title">What we assumed</h2>
      <p>
        {isSample
          ? `This is a sample ${industryName}, so every number is a typical one.`
          : `You told us a few things; we filled in the rest with typical numbers for a small ${industryName}.`}{" "}
        These are guesses, not facts about your business. Change anything that is not right and the page updates.
      </p>
      {dollars && (
        <p className="currency-notice" role="note">
          The typical pay, marketing and cash amounts we filled in are US dollars. Please change them to your own amounts in {currency}.
        </p>
      )}
      <ul className="assumed-rows">{main.map(row)}</ul>
      {rest.length > 0 && (
        <details>
          <summary>More typical values ({rest.length})</summary>
          <ul className="assumed-rows">{rest.map(row)}</ul>
        </details>
      )}
    </section>
  );
}
