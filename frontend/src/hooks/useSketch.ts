import { useEffect, useRef, useState } from "react";
import { previewChange, type Sketch, type SketchRequest } from "../api";

export const SKETCH_DEBOUNCE_MS = 200;

export interface SketchState {
  /** The last answer we have. It stays on screen while the next one loads, so the page never goes blank. */
  sketch: Sketch | null;
  /** A newer answer is on its way (the slider moved). Show a calm hint, never a blocking spinner. */
  updating: boolean;
  /** The last try did not work. The old answer (if any) is still shown. */
  failed: boolean;
}

/** The live "just a sketch" for a slider position. The first answer is asked for at once; after that, the slider
 *  is given 200 ms to settle before asking, an older request is cancelled when a newer one starts, and an answer
 *  that arrives too late is ignored. Nothing is stored anywhere. */
export function useSketch(businessId: number | null, request: SketchRequest, debounceMs = SKETCH_DEBOUNCE_MS): SketchState {
  const [state, setState] = useState<SketchState>({ sketch: null, updating: businessId !== null, failed: false });
  const askedOnce = useRef(false);
  const { type, amount, start_month } = request;

  useEffect(() => {
    if (businessId === null) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks "a newer answer is coming" when the slider moves
    setState((s) => (s.updating ? s : { ...s, updating: true }));
    const timer = setTimeout(
      () => {
        askedOnce.current = true;
        previewChange(businessId, { type, amount, start_month }, controller.signal).then(
          (sketch) => {
            if (!controller.signal.aborted) setState({ sketch, updating: false, failed: false });
          },
          () => {
            if (!controller.signal.aborted) setState((s) => ({ ...s, updating: false, failed: true }));
          },
        );
      },
      askedOnce.current ? debounceMs : 0, // the very first answer needs no waiting
    );
    return () => {
      clearTimeout(timer);
      controller.abort(); // an older request is dropped as soon as the slider moves again
    };
  }, [businessId, type, amount, start_month, debounceMs]);

  return state;
}
