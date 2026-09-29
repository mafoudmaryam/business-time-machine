import type { BaselineFormValues } from "../api";
import { NumberField } from "../components/NumberField";
import type { FieldSpec } from "../constants";
import { formatUnit, needsOwnAmount } from "../lib/format";

interface Props {
  fields: FieldSpec[];
  baseline: BaselineFormValues;
  currency: string;
  fieldLabels: Record<string, string>;
  /** Money fields the owner has already typed in (the rest are still US-dollar examples). */
  editedMoney: Set<string>;
  problems: Record<string, string>;
  onChange: (key: string, value: number) => void;
}

/** A few of the "about your business" numbers, inside the advisor's message. */
export function NumbersCard({ fields, baseline, currency, fieldLabels, editedMoney, problems, onChange }: Props) {
  const unedited = fields.some((f) => needsOwnAmount(f, currency, editedMoney));
  return (
    <div className="numbers-card">
      {unedited && (
        <p className="currency-notice" role="note">
          These example amounts are in US dollars — please enter your own amounts in {currency}.
        </p>
      )}
      <div className="numbers-grid">
        {fields.map((field) => (
          <NumberField
            key={field.key}
            highlight={needsOwnAmount(field, currency, editedMoney)}
            label={fieldLabels[field.key] ?? field.label}
            help={field.help}
            tooltip={field.help}
            unit={formatUnit(field.unit, currency)}
            min={field.min}
            max={field.max}
            step={field.step}
            value={baseline[field.key as keyof BaselineFormValues]}
            onChange={(v) => onChange(field.key, v)}
            error={problems[field.key]}
          />
        ))}
      </div>
    </div>
  );
}
