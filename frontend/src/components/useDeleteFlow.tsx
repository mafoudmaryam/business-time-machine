import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  deleteBusiness,
  deleteRun,
  deleteScenario,
  getBusinessImpact,
  getScenarioImpact,
  restoreBusiness,
  restoreRun,
  restoreScenario,
  type BusinessImpact,
  type ScenarioImpact,
} from "../api";
import { track } from "../lib/events";
import { businessWords, runWords, scenarioWords, type DeleteWords } from "../lib/deleteText";
import { Modal } from "./Modal";
import { useUndo } from "./undo";

/** What the owner asked to delete. `onDone` runs after it is deleted (refresh lists); `onUndone` after Undo. */
export type DeleteTarget =
  | { kind: "scenario"; id: number; name: string; onDone?: () => void; onUndone?: () => void }
  | { kind: "run"; id: number; scenarioNames: string[]; onDone?: () => void; onUndone?: () => void }
  | { kind: "business"; id: number; name: string; onDone?: () => void; onUndone?: () => void };

function label(t: DeleteTarget): string {
  return t.kind === "run" ? `run #${t.id}` : `“${t.name}”`;
}

/** The whole delete journey in one place: ask `ask(target)`, show `dialog` somewhere on the page.
 *  1. a box that says in plain words what else goes, with Delete and Cancel;
 *  2. after Delete, an "Undo" message for 8 seconds (see UndoProvider).
 *  Deleting only hides things on the server, so Undo is a restore and nothing is lost if the 8 seconds pass. */
export function useDeleteFlow(): { ask: (target: DeleteTarget) => void; dialog: ReactNode } {
  const offerUndo = useUndo();
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [impact, setImpact] = useState<{ kind: string; id: number; data: ScenarioImpact | BusinessImpact } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const ask = useCallback((next: DeleteTarget) => {
    setProblem(null);
    setTarget(next);
  }, []);

  // The box opens at once with a general sentence; it becomes exact when the numbers arrive.
  useEffect(() => {
    if (!target || target.kind === "run") return;
    let cancelled = false;
    const { kind, id } = target;
    const load = kind === "scenario" ? getScenarioImpact(id) : getBusinessImpact(id);
    load.then((data) => !cancelled && setImpact({ kind, id, data }), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [target]);

  const known = target && impact && impact.kind === target.kind && impact.id === target.id ? impact.data : null;
  const words: DeleteWords | null = !target
    ? null
    : target.kind === "run"
      ? runWords(target.id, target.scenarioNames)
      : target.kind === "scenario"
        ? scenarioWords(target.name, known as ScenarioImpact | null)
        : businessWords(target.name, known as BusinessImpact | null);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setProblem(null);
    try {
      if (target.kind === "scenario") await deleteScenario(target.id);
      else if (target.kind === "run") await deleteRun(target.id);
      else await deleteBusiness(target.id);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "We couldn't delete that just now.");
      setBusy(false);
      return;
    }
    const done = target;
    track("deleted", "delete", { kind: done.kind });
    setBusy(false);
    setTarget(null);
    done.onDone?.();
    offerUndo({
      message: `Deleted ${label(done)}.`,
      onUndo: async () => {
        if (done.kind === "scenario") await restoreScenario(done.id);
        else if (done.kind === "run") await restoreRun(done.id);
        else await restoreBusiness(done.id);
        track("delete_undone", "delete", { kind: done.kind });
        done.onUndone?.();
      },
    });
  }

  const dialog =
    target && words ? (
      <Modal title={words.title} onClose={() => !busy && setTarget(null)} hideClose>
        {words.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="field-help">You will be able to undo this for a few seconds.</p>
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
        <div className="confirm-delete-actions">
          <button type="button" className="secondary" onClick={() => setTarget(null)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    ) : null;

  return { ask, dialog };
}
