import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createSampleBusiness, listBusinesses, type BusinessOut } from "../api";
import { DEFAULT_CURRENCY } from "../lib/format";
import { track } from "../lib/events";
import { forgetBusiness, getRememberedBusinessId, rememberBusiness } from "../lib/session";
import { useDeleteFlow } from "./useDeleteFlow";

const SAMPLES = [
  { id: "cafe", label: "Café" },
  { id: "restaurant", label: "Restaurant" },
  { id: "bakery", label: "Bakery" },
];

/** The header's business menu: shows the business you are looking at, lets you switch to another, start a new one,
 *  try a sample, or delete one. A plain disclosure (button + list of buttons), so Tab, Enter, Space and Esc all work. */
export function BusinessSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessOut[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { ask, dialog } = useDeleteFlow();

  const refresh = useCallback(() => {
    listBusinesses().then(setBusinesses, () => undefined);
  }, []);

  // Keep the name in step with what the owner is looking at: after every page change and every time the menu opens.
  useEffect(refresh, [refresh, location.pathname, open]);

  // Esc closes and gives focus back to the button; clicking elsewhere closes too.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const currentId = getRememberedBusinessId();
  const current = businesses.find((b) => b.id === currentId) ?? null;

  function choose(b: BusinessOut) {
    rememberBusiness(b.id);
    track("business_switched", "header");
    setOpen(false);
    navigate("/today");
  }

  function startNew() {
    setOpen(false);
    navigate("/");
  }

  async function sample(industry: string) {
    setBusy(true);
    setProblem(null);
    try {
      const b = await createSampleBusiness(industry, DEFAULT_CURRENCY);
      rememberBusiness(b.id);
      track("business_created", "header", { how: "sample", industry });
      setOpen(false);
      navigate("/today");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "We couldn't make a sample just now.");
    } finally {
      setBusy(false);
    }
  }

  function remove(b: BusinessOut) {
    ask({
      kind: "business",
      id: b.id,
      name: b.name,
      onDone: () => {
        refresh();
        if (b.id === getRememberedBusinessId()) {
          forgetBusiness();
          navigate("/"); // nothing chosen any more: the start screen
        }
      },
      onUndone: () => {
        refresh();
        if (b.id === currentId) {
          rememberBusiness(b.id);
          navigate("/today");
        }
      },
    });
    setOpen(false);
  }

  return (
    <div className="switcher" ref={root}>
      <button
        type="button"
        ref={toggle}
        className="switcher-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="switcher-label">{current ? current.name : "Choose a business"}</span>
        <span aria-hidden="true"> ▾</span>
      </button>

      {open && (
        <div className="switcher-panel" id={panelId} role="group" aria-label="Your businesses">
          {businesses.length > 0 ? (
            <ul className="switcher-list">
              {businesses.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className="switcher-item"
                    aria-current={b.id === currentId ? "true" : undefined}
                    onClick={() => choose(b)}
                  >
                    {b.name}
                    {b.id === currentId && <span className="switcher-note"> (open now)</span>}
                    {b.is_sample && <span className="sample-tag">Sample business</span>}
                  </button>
                  <button
                    type="button"
                    className="link-button switcher-delete"
                    aria-label={`Delete ${b.name}`}
                    onClick={() => remove(b)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="switcher-empty">No businesses yet.</p>
          )}
          <button type="button" className="switcher-new" onClick={startNew}>
            New business
          </button>
          <div className="switcher-samples" role="group" aria-label="Sample business">
            <span className="switcher-samples-title">Sample business</span>
            {SAMPLES.map((s) => (
              <button key={s.id} type="button" className="secondary" disabled={busy} onClick={() => void sample(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          {problem && (
            <p className="field-error" role="alert">
              {problem}
            </p>
          )}
        </div>
      )}
      {dialog}
    </div>
  );
}
