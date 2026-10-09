import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getBusiness, getStartOptions } from "../../api";
import { useAsync } from "../../hooks/useAsync";
import { useSketch } from "../../hooks/useSketch";
import { track } from "../../lib/events";
import { DEFAULT_CURRENCY } from "../../lib/format";
import { getRememberedBusinessId } from "../../lib/session";
import { SaveDialog } from "./SaveDialog";
import {
  PRICE_DEFAULT, PRICE_MAX, PRICE_MIN, bankTile, catchText, dots, exampleText, futuresText, keepText, priceNote, timelineLink,
} from "../../lib/sketch";

function Dots({ ahead }: { ahead: number }) {
  return (
    <div className="try-dots" aria-hidden="true">
      {dots(ahead).map((on, i) => (
        <span key={i} className={on ? "try-dot try-dot-on" : "try-dot"} />
      ))}
    </div>
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
  const bank = sketch ? bankTile(sketch, currency) : null;

  return (
    <div className="page try-page">
      <h1>What if you changed your prices?</h1>
      <p className="try-lead">Move the slider. The answer on the right changes as you drag.</p>

      <div className="try-grid">
        <div className="try-left">
          <section className="try-card" aria-labelledby="try-how-much">
            <h2 id="try-how-much" className="try-eyebrow">How much would you raise your prices?</h2>
            <div className="try-big-row">
              <p className="try-big" key={percent} aria-hidden="true">{percent}%</p>
              <p className="try-example">{example ?? " "}</p>
            </div>
            <input
              type="range" className="try-slider" min={PRICE_MIN} max={PRICE_MAX} step={1} value={percent}
              style={{ ["--fill" as string]: `${((percent - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100}%` }}
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
            <span className="try-note-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
                <path d="M12 3a6.5 6.5 0 0 0-3.6 11.9c.5.4.8 1 .8 1.6V17h5.6v-.5c0-.6.3-1.2.8-1.6A6.5 6.5 0 0 0 12 3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M9.8 20.2h4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
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

            {sketch && keep && bank && (
              <div className={updating ? "try-numbers try-numbers-updating" : "try-numbers"}>
                <div className="try-tile try-tile-keep">
                  <h3 className="try-eyebrow">What you keep</h3>
                  <p className="try-keep">
                    <span className="try-keep-number" key={keep.amount}>{keep.amount}</span> <span className="try-keep-word">{keep.direction} each month</span>
                  </p>
                  <p>{keep.detail}</p>
                </div>

                <div className="try-tile">
                  <h3 className="try-eyebrow">Money in the bank</h3>
                  <p className="try-tile-number" key={bank.amount}>{bank.amount}</p>
                  <p>{bank.detail}</p>
                </div>

                <div className="try-tile try-tile-catch">
                  <h3 className="try-eyebrow">The catch</h3>
                  <p>{catchText(sketch.visits_change_per_month)}</p>
                </div>

                <div className="try-sure">
                  <h3 className="try-eyebrow">How sure are we?</h3>
                  <Dots ahead={sketch.ahead_of_10} />
                  <p>{futuresText(sketch.ahead_of_10)}</p>
                </div>
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

          <Link className="btn btn-green try-watch" to={timelineLink({ type: "price", amount: percent, start: startMonth })}>
            Watch the next 12 months →
          </Link>
          <button
            type="button" className="btn btn-amber try-save" disabled={!fresh}
            onClick={() => {
              track("save_opened", "try");
              setSaving(true);
            }}
          >
            Save as a plan
          </button>
        </div>
      </div>

      {saving && sketch && fresh && businessId && (
        <SaveDialog businessId={businessId} percent={percent} startMonth={startMonth} sketch={sketch} onClose={() => setSaving(false)} />
      )}
    </div>
  );
}
