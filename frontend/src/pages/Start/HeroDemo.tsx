import { ResultAssumptions } from "../../components/ResultAssumptions";
import { useState } from "react";
import { createSampleBusiness, type BusinessOut } from "../../api";
import { useSketch } from "../../hooks/useSketch";
import { bankTile, catchText, futuresText, keepText, formatMoneyCents, PRICE_DEFAULT, PRICE_MAX, PRICE_MIN } from "../../lib/sketch";

/** Sample creation is opt-in. Result figures come only from the engine's sketch endpoint. */
export function HeroDemo({ currency, onOpen }: { currency: string; onOpen: (business: BusinessOut) => void }) {
  const [percent, setPercent] = useState(PRICE_DEFAULT);
  const [sample, setSample] = useState<BusinessOut | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);
  const { sketch, updating, failed } = useSketch(sample?.id ?? null, { type: "price", amount: percent, start_month: 1 });
  const fresh = sketch !== null && !updating && !failed && sketch.type === "price" && sketch.amount === percent && sketch.start_month === 1;
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
      <div className="preview-top"><span className="preview-dot" aria-hidden="true" /> LET’S TRY ONE <span className="preview-badge">Sample café</span></div>
      <h2 id="demo-title" className="preview-question">What if you charged<br />a little more?</h2>
      <div className="cafe-scene" aria-hidden="true">
        <span className="scene-spark spark-one">✦</span><span className="scene-spark spark-two">✦</span>
        <div className="scene-orbit" /><div className="little-shop"><div className="shop-sign">YOUR CAFÉ</div><div className="shop-awning" /><div className="shop-front"><div className="shop-window"><svg viewBox="0 0 32 32" fill="none"><path d="M7 12h16v8a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7v-8Zm16 2h2a4 4 0 0 1 0 8h-2M12 5v3m5-3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></div><div className="shop-door" /></div></div>
        <span className="price-sticker" style={{ transform: `rotate(${percent - 10}deg)` }}>+{percent}%<small>price change</small></span>
      </div>
      
      <div className="demo-control">
        <div className="demo-label"><label htmlFor="demo-price">Make prices higher by</label><output htmlFor="demo-price">+{percent}%</output></div>
        <input id="demo-price" className="try-slider" type="range" min={PRICE_MIN} max={PRICE_MAX} step="1" value={percent} aria-valuetext={`${percent} percent`} style={{ ["--fill" as string]: `${((percent - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100}%` }} onChange={(event) => setPercent(Number(event.target.value))} />
        <div className="demo-range" aria-hidden="true"><span>A little nudge</span><span>A bigger move</span></div>
      </div>
      {!sample && (
        <div className="demo-invitation">
          <p>Move the slider, then try the example.</p>
          <button type="button" className="btn btn-green" disabled={opening} onClick={() => void run()}>{opening ? "Opening example…" : "See what happens →"}</button>
          {error && <p role="alert">The example couldn’t open. Try again.</p>}
        </div>
      )}
      {sample && (
        <div className="demo-results" aria-busy={updating}>
          <p className="demo-status" role="status">{failed ? (sketch ? "We couldn’t update. Showing your last result. Move the slider to try again." : "We couldn’t calculate this change. Move the slider to try again.") : updating ? "Working out this change…" : "Just a sketch · Next month"}</p>
          {sketch && keep && bank && (
            <>
              <p className="field-help">{fresh ? "Showing" : "Previous result:"} a {sketch.amount}% price rise from {sketch.start_label} (month {sketch.start_month}).</p>
              {sketch.example && <p className="demo-order">A {formatMoneyCents(sketch.example.before, sample.currency)} order → {formatMoneyCents(sketch.example.after, sample.currency)}</p>}
              <div className="demo-result-grid">
                <div><h3>Money left after bills</h3><p className="demo-result-number">{keep.amount}</p><p>{keep.direction} each month</p></div>
              </div>
              <p className="demo-catch"><strong>But there’s a catch</strong> {catchText(sketch.visits_change_per_month)}</p>
              <ResultAssumptions marketing={false} />
              <details className="demo-more">
              <summary>What else could happen?</summary>
              <h3>Money in the bank</h3><p className="demo-result-number">{bank.amount}</p><p>{bank.detail}</p>
              <p className="preview-footnote">{futuresText(sketch.ahead_of_10)}</p>
              </details>
            </>
          )}
          <p className="visually-hidden" aria-live="polite">{fresh && keep ? `${keep.amount} ${keep.direction} each month.` : ""}</p>
          <button type="button" className="link-button" disabled={!fresh} onClick={() => onOpen(sample)}>Keep exploring this café →</button>
        </div>
      )}
      <p className="preview-footnote demo-disclaimer">A made-up café. These are possibilities, not promises.</p>
    </aside>
  );
}
