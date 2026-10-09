import { Photo } from "../../components/Photo";
import { jumpLink } from "../../lib/jumpTo";
import { LANDING_PHOTOS } from "../../lib/landingImages";

/** The welcome part of the start screen: what the app is, in plain words. Shown only on the first step, above the form.
 *  The "+$1,320 a month" card is a FIXED example (it says so) and is never connected to anyone's real numbers. */

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
    text: "Write down what really happened each month and see how close the forecast was. You learn, and so does the model.",
  },
] as const;

const STEPS = [
  { title: "Tell us a little", text: "Four quick answers. We fill in the rest and show you what we assumed." },
  { title: "Try a change", text: "Slide a price and watch the answer move. Nothing is saved until you say so." },
  { title: "Learn from real life", text: "Record each month and compare it with what we expected." },
] as const;

function CoffeeCup() {
  return (
    <svg className="coffee-cup" viewBox="0 0 64 56" width="64" height="56" aria-hidden="true" focusable="false">
      <path d="M20 8c-3 4 3 6 0 10M30 6c-3 4 3 6 0 10M40 8c-3 4 3 6 0 10" fill="none" stroke="var(--amber-ink)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 24h40v12a16 16 0 0 1-16 16h-8A16 16 0 0 1 10 36V24Z" fill="var(--white)" stroke="var(--amber-ink)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M50 28h4a6 6 0 0 1 0 12h-5" fill="none" stroke="var(--amber-ink)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14 52h32" stroke="var(--amber-ink)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Landing() {
  return (
    <>
      <section className="hero-panel" aria-labelledby="hero-title">
        <div className="hero-copy reveal">
          <p className="hero-slogan">Better decisions today. A stronger tomorrow.</p>
          <h1 id="hero-title">Your business. A little more predictable.</h1>
          <p className="hero-lead">
            Try a change on paper before you make it, and see what could happen to your profit, cash and customers. In plain words.
          </p>
          <a href="#start-here" className="btn btn-amber" onClick={jumpLink("start-here")}>
            Start your journey →
          </a>
          <p className="hero-small">Free · Simple · Made for small businesses</p>
        </div>
        <div className="hero-photo reveal" style={{ ["--i" as string]: 2 }}>
          <div className="photo-frame photo-frame-hero">
            <Photo photo={LANDING_PHOTOS.hero} priority sizes="(max-width: 860px) 90vw, 520px" />
          </div>
          <div className="float-card" role="note" aria-label="An example, not your numbers">
            <p className="float-card-number">+$1,320 a month</p>
            <p className="float-card-label">An example, for a 7% price rise</p>
          </div>
        </div>
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
          <span className="quote-mark" aria-hidden="true">
            “
          </span>
          <blockquote>
            <p>We built this so that after your first change you can say: I understand my numbers, and I know what I'm choosing.</p>
          </blockquote>
          <figcaption>The Business Time Machine team</figcaption>
          <CoffeeCup />
        </figure>
      </section>
    </>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <p>Scenarios, not forecasts. Built from typical numbers and the ones you give us. Not financial advice.</p>
    </footer>
  );
}
