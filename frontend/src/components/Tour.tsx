import { useState } from "react";
import { track } from "../lib/events";
import { markTourSeen } from "../lib/session";
import { TOUR_STEPS } from "../lib/tourSteps";
import { Modal } from "./Modal";

/** A 30-second tour in three short steps. Skippable at any point; once it is closed (finished or skipped) it is not shown again. */
export function Tour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[step];

  function finish(how: "done" | "skip") {
    markTourSeen();
    track(how === "done" ? "tour_done" : "tour_skip", "today", { step: step + 1 });
    onClose();
  }

  function go(next: number) {
    setStep(next);
    track("tour_step", "today", { step: next + 1 });
  }

  return (
    <Modal title="A quick look around" onClose={() => finish("skip")} closeLabel="Skip tour">
      <p className="tour-count">
        Step {step + 1} of {TOUR_STEPS.length}
      </p>
      <h3>{current.title}</h3>
      <p>{current.text}</p>
      <div className="tour-actions">
        <button type="button" className="secondary" onClick={() => go(step - 1)} disabled={step === 0}>
          Back
        </button>
        {last ? (
          <button type="button" onClick={() => finish("done")}>
            Got it
          </button>
        ) : (
          <button type="button" onClick={() => go(step + 1)}>
            Next
          </button>
        )}
      </div>
    </Modal>
  );
}
