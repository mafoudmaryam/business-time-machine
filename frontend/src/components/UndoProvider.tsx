import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { UNDO_SECONDS, UndoContext, type UndoOffer } from "./undo";

/** Shows one "Deleted ... Undo" message at a time for 8 seconds at the bottom of the screen. A new delete replaces the old message. */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [offer, setOffer] = useState<(UndoOffer & { key: number }) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);

  const show = useCallback((next: UndoOffer) => {
    counter.current += 1;
    setProblem(null);
    setOffer({ ...next, key: counter.current });
  }, []);

  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => setOffer((o) => (o && o.key === offer.key ? null : o)), UNDO_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [offer]);

  async function undo() {
    if (!offer) return;
    setBusy(true);
    try {
      await offer.onUndo();
      setOffer(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "We couldn't undo that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <UndoContext.Provider value={show}>
      {children}
      <div className="undo-region" role="status" aria-live="polite">
        {offer && (
          <div className="undo-toast">
            <span>{problem ?? offer.message}</span>
            {!problem && (
              <button type="button" className="undo-button" onClick={() => void undo()} disabled={busy}>
                Undo
              </button>
            )}
            <button type="button" className="link-button undo-dismiss" onClick={() => setOffer(null)} aria-label="Dismiss this message">
              Dismiss
            </button>
          </div>
        )}
      </div>
    </UndoContext.Provider>
  );
}
