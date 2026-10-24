import { useState } from "react";
import { createSampleBusiness, type BusinessOut } from "../../api";
import { useSketch } from "../../hooks/useSketch";
import { bankTile, catchText, futuresText, keepText, PRICE_DEFAULT, PRICE_MAX, PRICE_MIN } from "../../lib/sketch";

/** Sample creation is opt-in. Result figures come only from the engine's sketch endpoint. */
export function HeroDemo({ currency, onOpen }: { currency: string; onOpen: (business: BusinessOut) => void }) {
  const [percent, setPercent] = useState(PRICE_DEFAULT);
  const [sample, setSample] = useState<BusinessOut | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);
  const { sketch, updating, failed } = useSketch(sample?.id ?? null, { type: "price", amount: percent, start_month: 1 });
  const keep = sketch ? keepText(sketch, sample?.currency ?? currency) : null;
  const bank = sketch ? bankTile(sketch, sample?.currency ?? currency) : null;

  async function run() {
    setOpening(true);
    setError(false);
    try {
      setSample(await createSampleBusiness("cafe", currency));
    } catch {
      setError(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <aside className="decision-preview" aria-labelledby="demo-title">
      <div className="preview-top"><span className="preview-dot" aria-hidden="true" /> THE TIME MACHINE <span className="preview-badge">Sample café</span></div>
      <h2 id="demo-title" className="preview-question">A small change.<br />A different tomorrow.</h2>
      <p className="preview-intro">Try a price rise on an example café.</p>
      <div className="demo-control">
        <div className="demo-label"><label htmlFor="demo-price">Raise prices by</label><output htmlFor="demo-price">+{percent}%</output></div>
        <input id="demo-price" className="try-slider" type="range" min={PRICE_MIN} max={PRICE_MAX} step="1" value={percent} aria-valuetext={`${percent} percent`} style={{ ["--fill" as string]: `${((percent - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100}%` }} onChange={(event) => setPercent(Number(event.target.value))} />
        <div className="demo-range" aria-hidden="true"><span>A little nudge</span><span>A bigger move</span></div>
      </div>
      {!sample && (
        <div className="demo-invitation">
          <p>What might you keep? What could you lose?</p>
          <button type="button" className="btn btn-green" disabled={opening} onClick={() => void run()}>{opening ? "Opening example…" : "Run this example →"}</button>
          {error && <p role="alert">The example couldn’t open. Try again.</p>}
        </div>
      )}
      {sample && (
        <div className="demo-results" aria-busy={updating}>
          <p className="demo-status" role="status">{failed ? (sketch ? "We couldn’t update. Showing your last result. Move the slider to try again." : "We couldn’t calculate this change. Move the slider to try again.") : updating ? "Working out this change…" : "Just a sketch · Next month"}</p>
          {sketch && keep && bank && (
            <>
              <div className="demo-result-grid">
                <div><h3>What you keep</h3><p className="demo-result-number">{keep.amount}</p><p>{keep.direction} each month</p></div>
                <div><h3>Money in the bank</h3><p className="demo-result-number">{bank.amount}</p><p>{bank.detail}</p></div>
              </div>
              <p className="demo-catch"><strong>The trade-off</strong> {catchText(sketch.visits_change_per_month)}</p>
              <p className="preview-footnote">{futuresText(sketch.ahead_of_10)}</p>
            </>
          )}
          <p className="visually-hidden" aria-live="polite">{!updating && !failed && keep ? `${keep.amount} ${keep.direction} each month.` : ""}</p>
          <button type="button" className="link-button" onClick={() => onOpen(sample)}>Explore this café in the full simulator →</button>
        </div>
      )}
      <p className="preview-footnote demo-disclaimer">Example numbers, not your business. Results are scenarios, not forecasts. Nothing is saved as a plan.</p>
    </aside>
  );
}
