import type { DecisionFormValues } from "../api";

/** Why the "Save" button is disabled, in plain words -- or null when it can save.
 * Every decision must be confirmed first (human in the loop, golden rule 2), so
 * the owner can't save something they haven't checked. */
export function saveBlocker(name: string, decisions: Pick<DecisionFormValues, "confirmed">[]): string | null {
  if (name.trim().length === 0) return "Give this what-if a name.";
  if (decisions.length === 0) return "Add at least one change.";
  const unconfirmed = decisions.filter((d) => !d.confirmed).length;
  if (unconfirmed === 1) return "Tick “Confirm” on the step above to save.";
  if (unconfirmed > 1) return `Tick “Confirm” on the ${unconfirmed} steps above to save.`;
  return null;
}
