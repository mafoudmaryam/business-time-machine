import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError, createScenario, getBusiness, getStartOptions, simulateBusiness, type Sketch } from "../../api";
import { Modal } from "../../components/Modal";
import { useAsync } from "../../hooks/useAsync";
import { useSketch } from "../../hooks/useSketch";
import { track } from "../../lib/events";
import { DEFAULT_CURRENCY } from "../../lib/format";
import { getRememberedBusinessId } from "../../lib/session";
import {
  PRICE_DEFAULT, PRICE_MAX, PRICE_MIN, catchText, dots, exampleText, futuresText, keepText, priceNote, scenarioName, timelineLink,
} from "../../lib/sketch";

const FULL_RUN_MONTHS = 24;

function Dots({ ahead }: { ahead: number }) {
  return (
    <div className="try-dots" aria-hidden="true">
      {dots(ahead).map((on, i) => (
        <span key={i} className={on ? "try-dot try-dot-on" : "try-dot"} />
      ))}
    </div>
  );
}

/** "Save this as a scenario": the owner confirms the plain sentence, then the normal flow runs (a real scenario, a full
 *  simulation, the coach). The sketch itself is never what gets saved: only the slider position, once confirmed. */
function SaveDialog({ businessId, percent, startMonth, sketch, onClose }: {
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
      navigate(`/history?business=${businessId}&run=${run.id}`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "We couldn't save that just now.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Save this as a scenario?" onClose={() => !busy && onClose()} hideClose>
      <p className="try-save-sentence">{sketch.sentence}.</p>
      <p>
        Saving makes a real scenario and runs the full simulation, with your coach. The numbers on the Try page were only a quick sketch.
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

export function TryPage() {
  const businessId = getRememberedBusinessId();
  const business = useAsync(() => (businessId ? getBusiness(businessId) : Promise.reject(new Error("none"))), [businessId]);
  const options = useAsync(getStartOptions, []);
  const [percent, setPercent] = useState(PRICE_DEFAULT);
  const [startMonth, setStartMonth] = useState(1);
  const [saving, setSaving] = useState(false);
  const { sketch, updating, failed } = useSketch(businessId, { type: "price", amount: percent, start_month: startMonth });

  useEffect(() => {
    track("screen_view", "try");
  }, []);

  // Tell the study what the person looked at, once the picture has settled (never what an AI said: there is none).
  useEffect(() => {
    if (sketch && !updating) track("sketch_viewed", "try", { amount: sketch.amount, start_month: sketch.start_month, ahead: sketch.ahead_of_10 });
  }, [sketch, updating]);

  if (!businessId) return <Navigate to="/" replace />;

  const currency = business.data?.currency ?? DEFAULT_CURRENCY;
  const fresh = sketch !== null && !updating && sketch.amount === percent && sketch.start_month === startMonth;
  const keep = sketch ? keepText(sketch, currency) : null;
  const example = sketch ? exampleText(sketch.example, currency) : null;

  return (
    <div className="page try-page">
      <h1>What if you changed your prices?</h1>
      <p className="try-lead">Move the slider. The answer on the right changes as you drag.</p>

      <div className="try-grid">
        <div className="try-left">
          <section className="try-card" aria-labelledby="try-how-much">
            <h2 id="try-how-much" className="try-eyebrow">How much would you raise your prices?</h2>
            <div className="try-big-row">
              <p className="try-big" aria-hidden="true">{percent}%</p>
              <p className="try-example">{example ?? " "}</p>
            </div>
            <input
              type="range" className="try-slider" min={PRICE_MIN} max={PRICE_MAX} step={1} value={percent}
              aria-labelledby="try-how-much" aria-valuetext={`${percent} percent`}
              onChange={(e) => setPercent(Number(e.target.value))}
            />
            <div className="try-slider-labels" aria-hidden="true">
              <span>A tiny nudge</span>
              <span>A big jump</span>
            </div>

            <h2 id="try-when" className="try-eyebrow try-when">When would it start?</h2>
            <div className="try-when-buttons" role="group" aria-labelledby="try-when">
              {(options.data?.options ?? []).map((o) => (
                <button
                  key={o.key} type="button" aria-pressed={startMonth === o.month} className={startMonth === o.month ? "try-start try-start-on" : "try-start"}
                  title={o.name}
                  onClick={() => {
                    setStartMonth(o.month);
                    track("start_picked", "try", { start_month: o.month });
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          <aside className="try-note" aria-label="A quick thought">
            <p>{priceNote(percent)}</p>
          </aside>
        </div>

        <div className="try-right">
          <section className="try-card try-result" aria-labelledby="try-result-title">
            <p className="sketch-pill">Just a sketch</p>
            <h2 id="try-result-title" className="visually-hidden">What this price rise would do (just a sketch)</h2>
            <p className="sketch-note">A quick estimate from your own numbers. Nothing is saved.</p>

            {!sketch && !failed && <p className="try-working">Working it out…</p>}
            {!sketch && failed && <p className="try-failed" role="alert">We couldn't work that out just now. Try moving the slider again.</p>}

            {sketch && keep && (
              <div className={updating ? "try-numbers try-numbers-updating" : "try-numbers"}>
                <h3 className="try-eyebrow">Each month, you would keep about</h3>
                <p className="try-keep">
                  <span className="try-keep-number">{keep.amount}</span> <span className="try-keep-word">{keep.direction}</span>
                </p>
                <p>{keep.detail}</p>

                <h3 className="try-eyebrow">The catch</h3>
                <p>{catchText(sketch.visits_change_per_month)}</p>

                <h3 className="try-eyebrow">How sure are we?</h3>
                <Dots ahead={sketch.ahead_of_10} />
                <p>{futuresText(sketch.ahead_of_10)}</p>
              </div>
            )}

            <p className="try-status" role="status">
              {updating && sketch ? "Updating…" : ""}
              {failed && sketch ? "We couldn't update just now. You are seeing your last try." : ""}
            </p>
            {/* Said aloud once the picture has settled, not on every step of the slider. */}
            <p className="visually-hidden" aria-live="polite">
              {fresh && sketch && keep ? `${keep.amount} ${keep.direction} each month. ${futuresText(sketch.ahead_of_10)}` : ""}
            </p>
          </section>

          <Link className="try-watch" to={timelineLink({ type: "price", amount: percent, start: startMonth })}>
            Watch the next 12 months →
          </Link>
          <button
            type="button" className="secondary try-save" disabled={!fresh}
            onClick={() => {
              track("save_opened", "try");
              setSaving(true);
            }}
          >
            Save this as a scenario
          </button>
        </div>
      </div>

      {saving && sketch && fresh && businessId && (
        <SaveDialog businessId={businessId} percent={percent} startMonth={startMonth} sketch={sketch} onClose={() => setSaving(false)} />
      )}
    </div>
  );
}
