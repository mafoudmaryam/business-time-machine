import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, createScenario, simulateBusiness, type Sketch } from "../../api";
import { Modal } from "../../components/Modal";
import { celebrate } from "../../lib/celebrate";
import { track } from "../../lib/events";
import { scenarioName } from "../../lib/sketch";

const FULL_RUN_MONTHS = 24;

/** "Save as a plan": the owner confirms the plain sentence, then the normal flow runs (a real scenario, a full
 *  simulation, the coach). The sketch itself is never what gets saved: only the slider position, once confirmed. */
export function SaveDialog({ businessId, percent, startMonth, sketch, onClose }: {
  businessId: number; percent: number; startMonth: number; sketch: Sketch; onClose: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setProblem(null);
    track("save_confirmed", "try", { amount: percent, start_month: startMonth });
    try {
      const decision = {
        type: "price" as const, start_month: startMonth, value: percent, unit: "percent", source: "user" as const,
        confirmed: true, confirmedVia: "try_change" as const,
      };
      const base = scenarioName(sketch);
      let scenario = null;
      for (let attempt = 1; attempt <= 4 && scenario === null; attempt++) {
        try {
          scenario = await createScenario(businessId, attempt === 1 ? base : `${base} (${attempt})`, [decision]);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409) || attempt === 4) throw err; // the name is taken: try the next one
        }
      }
      const run = await simulateBusiness(businessId, [scenario!.id], FULL_RUN_MONTHS);
      celebrate(); // the owner just saved something: that, and only that, is what we cheer
      navigate(`/history?business=${businessId}&run=${run.id}`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "We couldn't save that just now.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Save this as a plan?" onClose={() => !busy && onClose()} hideClose>
      <p className="try-save-sentence">{sketch.sentence}.</p>
      <p>
        Saving makes a plan and runs the full simulation, with your coach. The numbers on this page were only a quick sketch.
      </p>
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
      <div className="confirm-delete-actions">
        <button type="button" className="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Yes, that's what I mean"}
        </button>
      </div>
    </Modal>
  );
}
