import { useState } from "react";
import type { DecisionFormValues } from "../../api";
import { NumberField } from "../../components/NumberField";
import { DECISION_TYPE_HELP, DECISION_TYPE_LABELS, DECISION_TYPES, type DecisionType } from "../../constants";
import { formatUnit } from "../../lib/format";
import { decisionTypeImage } from "../../lib/images";

function tileLabel(type: DecisionType, staffNoun: string): string {
  return type === "hiring" ? `Hire a ${staffNoun}` : DECISION_TYPE_LABELS[type];
}

function defaultsFor(type: DecisionType): DecisionFormValues {
  const base = { type, start_month: 1, source: "user" as const, confirmed: false };
  switch (type) {
    case "price":
      return { ...base, value: 10, unit: "percent" };
    case "hiring":
      return { ...base, value: 1, unit: "fte" };
    case "marketing":
      return { ...base, value: 20, unit: "percent" };
    case "hours":
      return { ...base, value: 28, unit: "days" };
    case "menu":
      return { ...base, value: 8, unit: "percent" };
    case "investment":
      return { ...base, value: 5000, unit: "amount" };
  }
}

const OPTIONAL_NUMERIC_FIELDS = ["loan_months", "annual_rate", "capacity_pct", "cogs_ratio", "investment"] as const;

/** Only checks that every number the user touched is actually a valid number
 * -- this is the decision form's "on Save" moment, mirrored from the setup
 * wizard's per-step validation. It doesn't re-check business-rule ranges
 * (e.g. start_month vs. horizon), which the engine already validates at
 * simulate time. */
function validateDraft(draft: DecisionFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isFinite(draft.start_month) || draft.start_month < 1) {
    errors.start_month = "Enter a month number of 1 or more.";
  }
  if (!Number.isFinite(draft.value)) {
    errors.value = "Enter a number.";
  }
  for (const key of OPTIONAL_NUMERIC_FIELDS) {
    const v = draft[key];
    if (v !== undefined && !Number.isFinite(v)) {
      errors[key] = "Enter a number.";
    }
  }
  return errors;
}

interface Props {
  industryId: string;
  staffNoun: string;
  currency: string;
  onAdd: (decision: DecisionFormValues) => void;
  /** Editing an existing step: start from its values, keep them after saving, and offer a way out. */
  initial?: DecisionFormValues;
  submitLabel?: string;
  onCancel?: () => void;
}

export function DecisionForm({ industryId, staffNoun, currency, onAdd, initial, submitLabel, onCancel }: Props) {
  const [draft, setDraft] = useState<DecisionFormValues>(initial ?? defaultsFor("price"));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function changeType(type: DecisionType) {
    // keep the "where it came from" details when editing a step and only the kind of decision changes
    setDraft({ ...defaultsFor(type), ...(initial ? { source: initial.source, origin: initial.origin } : {}) });
    setErrors({});
  }

  function set<K extends keyof DecisionFormValues>(key: K, value: DecisionFormValues[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function add() {
    const draftErrors = validateDraft(draft);
    setErrors(draftErrors);
    if (Object.keys(draftErrors).length > 0) return;
    onAdd(draft);
    if (!initial) setDraft(defaultsFor(draft.type));
    setErrors({});
  }

  return (
    <div className="decision-form">
      <div className="field">
        <span>Decision type</span>
        <div className="decision-tiles">
          {DECISION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={t === draft.type ? "decision-tile selected" : "decision-tile"}
              style={{ backgroundImage: `url(${decisionTypeImage(industryId, t)})` }}
              onClick={() => changeType(t)}
            >
              <span className="decision-tile-label">{tileLabel(t, staffNoun)}</span>
            </button>
          ))}
        </div>
        <p className="field-help">{DECISION_TYPE_HELP[draft.type]}</p>
      </div>

      <NumberField
        label="Start month"
        help="The simulation month this change takes effect (month 1 = the first month simulated)."
        tooltip="Counting from month 1 = the first month of the simulation, not a calendar month."
        unit="month"
        min={1}
        step={1}
        value={draft.start_month}
        onChange={(v) => set("start_month", Math.round(v))}
        error={errors.start_month}
      />

      {draft.type === "price" && (
        <>
          <div className="field">
            <label htmlFor="price-unit">Change type</label>
            <select id="price-unit" value={draft.unit} onChange={(e) => set("unit", e.target.value)}>
              <option value="percent">Percentage change</option>
              <option value="absolute">New absolute price</option>
            </select>
          </div>
          <NumberField
            label={draft.unit === "percent" ? "Price change" : "New price"}
            help={draft.unit === "percent" ? "Positive to raise, negative to cut." : "The new average sale per visit."}
            tooltip={draft.unit === "percent" ? "Positive to raise, negative to cut." : "The new average sale per visit."}
            unit={draft.unit === "percent" ? "%" : formatUnit("{CUR}/visit", currency)}
            step={draft.unit === "percent" ? 1 : 0.1}
            value={draft.value}
            onChange={(v) => set("value", v)}
            error={errors.value}
          />
        </>
      )}

      {draft.type === "hiring" && (
        <NumberField
          label="Staff change"
          help={`Positive to hire, negative to let go. Two half-time ${staffNoun}s count as one full-time hire.`}
          tooltip={`Positive to hire, negative to let go. Two half-time ${staffNoun}s count as one full-time hire.`}
          unit="full-time equivalent"
          step={0.5}
          value={draft.value}
          onChange={(v) => set("value", v)}
          error={errors.value}
        />
      )}

      {draft.type === "marketing" && (
        <>
          <div className="field">
            <label htmlFor="marketing-unit">Change type</label>
            <select id="marketing-unit" value={draft.unit} onChange={(e) => set("unit", e.target.value)}>
              <option value="percent">Percentage change</option>
              <option value="per_month">New absolute monthly spend</option>
            </select>
          </div>
          <NumberField
            label={draft.unit === "percent" ? "Spend change" : "New monthly spend"}
            help={draft.unit === "percent" ? "Positive to increase, negative to decrease." : "The new monthly marketing budget."}
            tooltip={draft.unit === "percent" ? "Positive to increase, negative to decrease." : "The new monthly marketing budget."}
            unit={draft.unit === "percent" ? "%" : formatUnit("{CUR}/month", currency)}
            step={draft.unit === "percent" ? 1 : 50}
            value={draft.value}
            onChange={(v) => set("value", v)}
            error={errors.value}
          />
        </>
      )}

      {draft.type === "hours" && (
        <NumberField
          label="Open days"
          help="How many days per month the business will be open from the start month."
          tooltip="How many days per month the business will be open from the start month."
          unit="days/month"
          min={1}
          max={31}
          step={1}
          value={draft.value}
          onChange={(v) => set("value", v)}
          error={errors.value}
        />
      )}

      {draft.type === "menu" && (
        <>
          <NumberField
            label="Menu price change"
            help="Upsell / reprice: raises the average sale per visit without an explicit new price."
            tooltip="Upsell / reprice: raises the average sale per visit without an explicit new price."
            unit="%"
            step={1}
            value={draft.value}
            onChange={(v) => set("value", v)}
            error={errors.value}
          />
          <NumberField
            label="New ingredient costs (optional)"
            help="Leave unchanged unless the new items also change your ingredient costs."
            tooltip="Leave unchanged unless the new items also change your ingredient costs."
            unit="% of sales"
            min={0}
            max={99}
            step={1}
            value={draft.cogs_ratio ?? 0}
            onChange={(v) => set("cogs_ratio", v)}
            error={errors.cogs_ratio}
          />
          <NumberField
            label="One-off setup cost (optional)"
            help="Equipment or menu-design cost charged once, in the start month."
            tooltip="Equipment or menu-design cost charged once, in the start month."
            unit={formatUnit("{CUR}", currency)}
            min={0}
            step={100}
            value={draft.investment ?? 0}
            onChange={(v) => set("investment", v)}
            error={errors.investment}
          />
        </>
      )}

      {draft.type === "investment" && (
        <>
          <NumberField
            label="Amount"
            help="The purchase price."
            tooltip="The purchase price."
            unit={formatUnit("{CUR}", currency)}
            min={0}
            step={100}
            value={draft.value}
            onChange={(v) => set("value", v)}
            error={errors.value}
          />
          <NumberField
            label="Loan months (optional)"
            help="0 pays the full amount up front; otherwise it's spread over this many months."
            tooltip="0 pays the full amount up front; otherwise it's spread over this many months."
            unit="months"
            min={0}
            step={1}
            value={draft.loan_months ?? 0}
            onChange={(v) => set("loan_months", Math.round(v))}
            error={errors.loan_months}
          />
          <NumberField
            label="Loan annual interest rate (optional)"
            help="Only used when loan months is above 0."
            tooltip="Only used when loan months is above 0."
            unit="%"
            min={0}
            step={0.5}
            value={draft.annual_rate ?? 0}
            onChange={(v) => set("annual_rate", v)}
            error={errors.annual_rate}
          />
          <NumberField
            label="Capacity gain (optional)"
            help="How much more the business can serve, e.g. faster or bigger equipment."
            tooltip="How much more the business can serve, e.g. faster or bigger equipment."
            unit="%"
            step={1}
            value={draft.capacity_pct ?? 0}
            onChange={(v) => set("capacity_pct", v)}
            error={errors.capacity_pct}
          />
        </>
      )}

      <button type="button" onClick={add}>
        {submitLabel ?? "Add decision"}
      </button>
      {onCancel && (
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
