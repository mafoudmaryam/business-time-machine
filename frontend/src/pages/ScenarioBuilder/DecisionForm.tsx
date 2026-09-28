import { useState } from "react";
import type { DecisionFormValues } from "../../api";
import { NumberField } from "../../components/NumberField";
import { DECISION_TYPE_HELP, DECISION_TYPE_LABELS, DECISION_TYPES, type DecisionType } from "../../constants";
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

interface Props {
  industryId: string;
  staffNoun: string;
  onAdd: (decision: DecisionFormValues) => void;
}

export function DecisionForm({ industryId, staffNoun, onAdd }: Props) {
  const [draft, setDraft] = useState<DecisionFormValues>(defaultsFor("price"));

  function changeType(type: DecisionType) {
    setDraft(defaultsFor(type));
  }

  function set<K extends keyof DecisionFormValues>(key: K, value: DecisionFormValues[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function add() {
    onAdd(draft);
    setDraft(defaultsFor(draft.type));
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
        unit="month"
        min={1}
        step={1}
        value={draft.start_month}
        onChange={(v) => set("start_month", Math.round(v))}
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
            help={draft.unit === "percent" ? "Positive to raise, negative to cut." : "The new average ticket price."}
            unit={draft.unit === "percent" ? "%" : "{CUR}/visit"}
            step={draft.unit === "percent" ? 1 : 0.1}
            value={draft.value}
            onChange={(v) => set("value", v)}
          />
        </>
      )}

      {draft.type === "hiring" && (
        <NumberField
          label="Staff change"
          help={`Positive to hire, negative to let go, in FTE ${staffNoun}s.`}
          unit="FTE"
          step={0.5}
          value={draft.value}
          onChange={(v) => set("value", v)}
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
            unit={draft.unit === "percent" ? "%" : "{CUR}/month"}
            step={draft.unit === "percent" ? 1 : 50}
            value={draft.value}
            onChange={(v) => set("value", v)}
          />
        </>
      )}

      {draft.type === "hours" && (
        <NumberField
          label="Open days"
          help="How many days per month the business will be open from the start month."
          unit="days/month"
          min={1}
          max={31}
          step={1}
          value={draft.value}
          onChange={(v) => set("value", v)}
        />
      )}

      {draft.type === "menu" && (
        <>
          <NumberField
            label="Menu price change"
            help="Upsell / reprice: raises the average ticket without an explicit new price."
            unit="%"
            step={1}
            value={draft.value}
            onChange={(v) => set("value", v)}
          />
          <NumberField
            label="New ingredient cost ratio (optional)"
            help="Leave unchanged unless the new items also change your cost of goods."
            unit="%"
            min={0}
            max={99}
            step={1}
            value={draft.cogs_ratio ?? 0}
            onChange={(v) => set("cogs_ratio", v)}
          />
          <NumberField
            label="One-off setup cost (optional)"
            help="Equipment or menu-design cost charged once, in the start month."
            unit="{CUR}"
            min={0}
            step={100}
            value={draft.investment ?? 0}
            onChange={(v) => set("investment", v)}
          />
        </>
      )}

      {draft.type === "investment" && (
        <>
          <NumberField
            label="Amount"
            help="The purchase price."
            unit="{CUR}"
            min={0}
            step={100}
            value={draft.value}
            onChange={(v) => set("value", v)}
          />
          <NumberField
            label="Loan months (optional)"
            help="0 pays the full amount up front; otherwise it's spread over this many months."
            unit="months"
            min={0}
            step={1}
            value={draft.loan_months ?? 0}
            onChange={(v) => set("loan_months", Math.round(v))}
          />
          <NumberField
            label="Loan annual interest rate (optional)"
            help="Only used when loan months is above 0."
            unit="%"
            min={0}
            step={0.5}
            value={draft.annual_rate ?? 0}
            onChange={(v) => set("annual_rate", v)}
          />
          <NumberField
            label="Capacity gain (optional)"
            help="How much more the business can serve, e.g. faster or bigger equipment."
            unit="%"
            step={1}
            value={draft.capacity_pct ?? 0}
            onChange={(v) => set("capacity_pct", v)}
          />
        </>
      )}

      <button type="button" onClick={add}>
        Add decision
      </button>
    </div>
  );
}
