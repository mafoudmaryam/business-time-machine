import { useState } from "react";
import type { ConfirmVia, DecisionFormValues } from "../../api";
import { NumberField } from "../../components/NumberField";
import { groupSteps, pairSentence, reverseOf, stepSentence, type StepItem } from "../../lib/interpretView";
import { DecisionForm } from "./DecisionForm";

interface Props {
  decisions: DecisionFormValues[];
  industryId: string;
  staffNoun: string;
  currency: string;
  /** Ticks or un-ticks one or more steps (a temporary change is two steps that are ticked together). */
  onSetConfirmed: (indexes: number[], confirmed: boolean, via: ConfirmVia) => void;
  /** Confirms every step at once (the owner can still read each sentence above and below the button). */
  onConfirmAll: () => void;
  onRemove: (indexes: number[]) => void;
  onEdit: (item: StepItem, edited: DecisionFormValues, endMonth: number | null) => void;
}

function isConfirmed(item: StepItem): boolean {
  return item.kind === "pair" ? item.start.confirmed && item.end.confirmed : item.step.confirmed;
}

function indexesOf(item: StepItem): number[] {
  return item.kind === "pair" ? [item.index, item.endIndex] : [item.index];
}

/** Each step's plain-language sentence plus its own "I confirm these parameters" checkbox -- the
 * human-in-the-loop step (golden rule 2). Steps that came from the owner's own words show those words softly
 * underneath, and every step can be edited with the same sentence-style form before it is ticked. */
export function DecisionList({ decisions, industryId, staffNoun, currency, onSetConfirmed, onConfirmAll, onRemove, onEdit }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [endMonth, setEndMonth] = useState<number>(NaN);

  if (decisions.length === 0) {
    return <p className="empty-hint">No decisions added yet.</p>;
  }

  function startEditing(item: StepItem) {
    setEditing(item.index);
    setEndMonth(item.kind === "pair" ? item.end.start_month : NaN);
  }

  const items = groupSteps(decisions);
  const confirmedCount = items.filter((item) => isConfirmed(item)).length;
  const allConfirmed = confirmedCount === items.length;

  return (
    <>
      <div className="confirm-bar">
        <span className="confirm-bar-count" role="status" aria-live="polite">
          {items.length} {items.length === 1 ? "step" : "steps"} · {confirmedCount} confirmed
        </span>
        <button type="button" className="confirm-all" onClick={onConfirmAll} disabled={allConfirmed}>
          {allConfirmed ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              All confirmed
            </>
          ) : (
            "Confirm all"
          )}
        </button>
      </div>
    <ul className="decision-list">
      {items.map((item) => {
        const first = item.kind === "pair" ? item.start : item.step;
        const confirmed = isConfirmed(item);
        const sentence =
          item.kind === "pair" ? pairSentence(item.start, item.end, staffNoun, currency) : stepSentence(item.step, staffNoun, currency);
        const quote = first.origin?.quote;
        const sentenceId = `step-sentence-${item.index}`;

        if (editing === item.index) {
          const isPair = item.kind === "pair";
          const canStop = reverseOf({ ...first, value: first.value }, 1) !== null;
          return (
            <li key={item.index} className="decision-row decision-row-editing">
              <p className="decision-summary">Change this step</p>
              {isPair && canStop && (
                <NumberField
                  label="Back to normal in month"
                  help="The month the change stops. Leave it empty to keep it going."
                  tooltip="Month 1 is next month. Leave this empty if the change should not stop."
                  unit="month"
                  min={2}
                  step={1}
                  value={endMonth}
                  onChange={setEndMonth}
                />
              )}
              <DecisionForm
                industryId={industryId}
                staffNoun={staffNoun}
                currency={currency}
                initial={first}
                submitLabel="Save changes"
                onCancel={() => setEditing(null)}
                onAdd={(edited) => {
                  onEdit(item, edited, isPair && canStop && Number.isFinite(endMonth) ? endMonth : null);
                  setEditing(null);
                }}
              />
            </li>
          );
        }

        return (
          <li key={item.index} className={`decision-row${quote !== undefined ? " decision-row-ai" : ""}`}>
            <div className="decision-main">
              <p className="decision-summary" id={sentenceId}>
                {sentence}
              </p>
              {quote && <p className="decision-quote">From your words: “{quote}”</p>}
              {first.edited && <p className="decision-quote">You changed this step.</p>}
            </div>
            <label className="confirm-checkbox">
              <input
                type="checkbox"
                aria-describedby={sentenceId}
                checked={confirmed}
                onChange={() => onSetConfirmed(indexesOf(item), !confirmed, "one_by_one")}
              />
              I confirm these parameters
            </label>
            <button type="button" className="link-button" aria-describedby={sentenceId} onClick={() => startEditing(item)}>
              Edit
            </button>
            <button type="button" className="link-button" aria-describedby={sentenceId} onClick={() => onRemove(indexesOf(item))}>
              Remove
            </button>
          </li>
        );
      })}
    </ul>
    </>
  );
}
