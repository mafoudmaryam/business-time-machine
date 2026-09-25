import type { ChangeEvent } from "react";
import { formatUnit } from "../lib/format";

interface NumberFieldProps {
  label: string;
  help: string;
  unit: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
}

/** A labeled number input with its unit and a one-line help text underneath --
 * the building block for both the setup wizard and the decision forms. */
export function NumberField({ label, help, unit, value, onChange, min, max, step, error }: NumberFieldProps) {
  const id = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const n = e.target.valueAsNumber;
    onChange(Number.isNaN(n) ? 0 : n);
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="field-unit">({formatUnit(unit)})</span>
      </label>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? "any"}
        onChange={handleChange}
        aria-invalid={error ? "true" : undefined}
      />
      <p className="field-help">{help}</p>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
