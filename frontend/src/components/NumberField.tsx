import { useEffect, useState, type ChangeEvent, type FocusEvent } from "react";
import { InfoTip } from "./InfoTip";

interface NumberFieldProps {
  label: string;
  help: string;
  /** Already resolved, e.g. "$/visit" -- callers substitute the business's
   * own currency symbol via lib/format.ts#formatUnit before passing this in. */
  unit: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
  /** One-sentence plain-language explanation, shown via a "?" tooltip next to the label. */
  tooltip?: string;
  /** Draws attention to the field (e.g. an example amount the owner still has to replace). */
  highlight?: boolean;
}

function toText(value: number): string {
  return Number.isNaN(value) ? "" : String(value);
}

/** A labeled number input with its unit and a one-line help text underneath --
 * the building block for both the setup wizard and the decision forms.
 *
 * Backed by a plain text input (not type="number") with its own local text
 * state: this is what lets the field sit empty, keep a lone "-" or a trailing
 * "." while the user is mid-type, and avoid the browser's number-input quirks
 * (a value can't be cleared, "0" plus a keystroke becomes "0500"). The local
 * text only re-syncs from `value` when the number actually changes elsewhere
 * (e.g. switching industries), never on every render, so it never fights the
 * user's own typing. Invalid/empty input is reported upward as NaN and left
 * for the caller to validate on Next/Save -- this field never forces a 0. */
export function NumberField({ label, help, unit, value, onChange, error, tooltip, highlight }: NumberFieldProps) {
  const id = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const [text, setText] = useState(() => toText(value));

  useEffect(() => {
    setText(toText(value));
    // Only re-sync when the numeric value itself changes, not on every parent
    // re-render, or this would clobber in-progress typing (e.g. "5." -> "5").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    onChange(raw.trim() === "" ? NaN : Number(raw));
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    e.target.select();
  }

  return (
    <div className={highlight ? "field field-highlight" : "field"}>
      <label htmlFor={id}>
        {label} <span className="field-unit">({unit})</span>
        {tooltip && <InfoTip text={tooltip} />}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        aria-invalid={error ? "true" : undefined}
      />
      <p className="field-help">{help}</p>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
