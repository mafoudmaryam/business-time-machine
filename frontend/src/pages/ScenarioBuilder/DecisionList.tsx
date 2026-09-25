import type { DecisionFormValues } from "../../api";
import { decisionSummary } from "../../lib/decisionSummary";

interface Props {
  decisions: DecisionFormValues[];
  onToggleConfirmed: (index: number) => void;
  onRemove: (index: number) => void;
}

/** Each decision's plain-language sentence plus its own "I confirm these
 * parameters" checkbox -- the human-in-the-loop step (golden rule 2). */
export function DecisionList({ decisions, onToggleConfirmed, onRemove }: Props) {
  if (decisions.length === 0) {
    return <p className="empty-hint">No decisions added yet.</p>;
  }

  return (
    <ul className="decision-list">
      {decisions.map((d, i) => (
        <li key={i} className="decision-row">
          <p className="decision-summary">{decisionSummary(d)}</p>
          <label className="confirm-checkbox">
            <input type="checkbox" checked={d.confirmed} onChange={() => onToggleConfirmed(i)} />
            I confirm these parameters
          </label>
          <button type="button" className="link-button" onClick={() => onRemove(i)}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
