import { Link } from "react-router-dom";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Photo } from "../../components/Photo";
import { jumpLink } from "../../lib/jumpTo";
import { LANDING_PHOTOS } from "../../lib/landingImages";

/** First-step welcome: a direct sample entry and an interface preview without calculated figures. */

const CARDS = [
  {
    key: "impact",
    title: "See the impact",
    text: "Profit, cash and customers for the next 12 months, with a good case and a bad case, not one magic number.",
  },
  {
    key: "explain",
    title: "Get a simple explanation",
    text: "A friendly coach explains what the numbers mean. It never makes up a figure; a real model does the maths.",
  },
  {
    key: "journal",
    title: "Keep a journal",
    text: "Write down what really happened each month and see how close the forecast was. Use the comparison to inform your next decision.",
  },
] as const;

const STEPS = [
  { title: "Tell us a little", text: "Four quick answers. We fill in the rest and show you what we assumed." },
  { title: "Try a change", text: "Slide a price and watch the answer move. Nothing is saved until you say so." },
  { title: "Learn from real life", text: "Record each month and compare it with what we expected." },
] as const;

function CoffeeCup() {
  return (
    <svg className="coffee-cup" viewBox="0 0 64 56" width="44" height="38" aria-hidden="true" focusable="false">
      <path d="M20 8c-3 4 3 6 0 10M30 6c-3 4 3 6 0 10M40 8c-3 4 3 6 0 10" fill="none" stroke="var(--amber-ink)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 24h40v12a16 16 0 0 1-16 16h-8A16 16 0 0 1 10 36V24Z" fill="var(--white)" stroke="var(--amber-ink)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M50 28h4a6 6 0 0 1 0 12h-5" fill="none" stroke="var(--amber-ink)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14 52h32" stroke="var(--amber-ink)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Landing({ onTrySample, busy, failure }: { onTrySample: () => void; busy: boolean; failure: string | null }) {
  return (
    <>
      <section className="hero-panel" aria-labelledby="hero-title">
        <div className="hero-copy reveal">
          <p className="hero-slogan">A clearer picture of what comes next</p>
          <h1 id="hero-title">
            See what your next business decision could change.
          </h1>
          <p className="hero-lead">
            Try a change on paper before you make it. Explore what it could mean for your profit, cash and customers—built for cafés, restaurants and bakeries.
          </p>
          <div className="hero-buttons">
            <a href="#start-here" className="btn btn-amber" onClick={jumpLink("start-here")}>
              Use my own numbers →
            </a>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onTrySample}>
              {busy ? "Opening sample…" : "Explore a sample café"}
            </button>
          </div>
          <ErrorBanner message={failure} />
          <p className="hero-small">Four quick answers to get started. Or explore with example numbers.</p>
          <Link to="/guide" className="hero-guide">Not open yet? Build a rough start-up plan →</Link>
        </div>
        <aside className="decision-preview" aria-label="A preview of how to explore a decision">
          <div className="preview-top"><span className="preview-dot" aria-hidden="true" /> YOUR DECISION SPACE <span className="preview-badge">Preview</span></div>
          <p className="preview-question">What if you raised your prices?</p>
          <p className="preview-intro">Explore the upside. Understand the trade-off.</p>
          <ol className="preview-flow">
            <li><span className="preview-step" aria-hidden="true">01</span><div><strong>Start with your business</strong><p>Customers, costs and the cash you have.</p></div></li>
            <li><span className="preview-step" aria-hidden="true">02</span><div><strong>Try a different direction</strong><p>Adjust a price. Choose when it starts.</p></div></li>
            <li><span className="preview-step" aria-hidden="true">03</span><div><strong>See the possible outcomes</strong><p>Profit, cash and customers, side by side.</p></div></li>
          </ol>
          <div className="preview-bottom"><span>Good case · Most likely · Bad case</span><span aria-hidden="true">↗</span></div>
          <p className="preview-footnote">Open the sample to see calculated results. No results are shown in this preview.</p>
        </aside>
      </section>

      <section id="what-you-get" className="landing-section" aria-labelledby="what-you-get-title">
        <h2 id="what-you-get-title" className="visually-hidden">
          What you get
        </h2>
        <div className="photo-cards">
          {CARDS.map((card, i) => (
            <article key={card.key} className="photo-card reveal" style={{ ["--i" as string]: i }}>
              <div className="photo-frame photo-frame-card">
                <Photo photo={LANDING_PHOTOS[card.key]} sizes="(max-width: 860px) 90vw, 360px" />
              </div>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="landing-section" aria-labelledby="how-it-works-title">
        <h2 id="how-it-works-title" className="landing-heading">
          Three small steps
        </h2>
        <ol className="small-steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="small-step reveal" style={{ ["--i" as string]: i }}>
              <span className="small-step-number" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section" aria-label="A note from the team">
        <figure className="quote-card reveal">
          <div className="quote-badge" aria-hidden="true">
            <CoffeeCup />
          </div>
          <div className="quote-body">
            <blockquote>
              <p>
                <span className="quote-mark" aria-hidden="true">
                  “
                </span>
                We can’t promise the future. We can help you see what might happen before you decide.
              </p>
            </blockquote>
            <span className="quote-rule" aria-hidden="true" />
            <figcaption>The Business Time Machine team</figcaption>
          </div>
        </figure>
      </section>
    </>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <p>Scenarios, not forecasts. Built from typical numbers and the ones you give us. Not financial advice.</p>
      <p>Some pictures on this site are AI-generated illustrations and the others are stock photos. None show our customers or owners.</p>
    </footer>
  );
}

