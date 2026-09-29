import type { DecisionFormValues } from "../../api";
import { decisionSummary } from "../../lib/decisionSummary";

interface Props {
  decisions: DecisionFormValues[];
  staffNoun: string;
  currency: string;
  onToggleConfirmed: (index: number) => void;
  onRemove: (index: number) => void;
}

/** "The recipe": each change as a numbered step in plain words, with its own
 * Confirm checkbox -- the human-in-the-loop step (golden rule 2). */
export function DecisionList({ decisions, staffNoun, currency, onToggleConfirmed, onRemove }: Props) {
  if (decisions.length === 0) {
    return <p className="empty-hint">No changes yet. Pick one on the left and press “Add to recipe”.</p>;
  }

  return (
    <ol className="recipe-steps">
      {decisions.map((d, i) => (
        <li key={i} className={d.confirmed ? "recipe-step is-confirmed" : "recipe-step"}>
          <span className="recipe-number" aria-hidden="true">
            {i + 1}
          </span>
          <div className="recipe-body">
            <p className="decision-summary">{decisionSummary(d, staffNoun, currency)}</p>
            {d.source === "ai" && <span className="badge badge-soft">Suggested by your coach</span>}
            <div className="recipe-actions">
              <label className="confirm-checkbox">
                <input type="checkbox" checked={d.confirmed} onChange={() => onToggleConfirmed(i)} />
                Confirm
              </label>
              <button type="button" className="link-button" onClick={() => onRemove(i)}>
                Remove
              </button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
