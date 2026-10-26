import type { BusinessOut } from "../../api";
import { HeroDemo } from "./HeroDemo";
import { ErrorBanner } from "../../components/ErrorBanner";
import { jumpLink } from "../../lib/jumpTo";

const BENEFITS = [
  { icon: "↗", title: "Try a small change", text: "What if you charged a little more?" },
  { icon: "◎", title: "See what could happen", text: "More money left—or fewer customers?" },
  { icon: "✓", title: "Choose with more confidence", text: "Explore an idea before spending money." },
];

export function Landing({ onTrySample, onOpenSample, currency, busy, failure }: { onTrySample: () => void; onOpenSample: (business: BusinessOut) => void; currency: string; busy: boolean; failure: string | null }) {
  return (
    <>
      <section className="hero-panel" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="hero-slogan"><span aria-hidden="true">✦</span> A little practice for your next big idea</p>
          <h1 id="hero-title">Big idea?<br /> <em>Try it first.</em></h1>
          <p className="hero-lead">See what a small change could mean for your café, bakery or restaurant—before you spend money.</p>
          <div className="hero-buttons">
            <a href="#start-here" className="btn btn-green" onClick={jumpLink("start-here")}>Try my business →</a>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onTrySample}>{busy ? "Opening example…" : "Show me an example"}</button>
          </div>
          <ErrorBanner message={failure} />
          <p className="hero-small">No business knowledge needed. We’ll guide you.</p>
        </div>
        <HeroDemo currency={currency} onOpen={onOpenSample} />
      </section>
      <section id="how-it-works" className="quick-benefits" aria-labelledby="what-you-get">
        <h2 id="what-you-get" className="visually-hidden">How it works</h2>
        {BENEFITS.map((item) => <article key={item.title}><span className="benefit-icon" aria-hidden="true">{item.icon}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}
      </section>
    </>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <p>Possible outcomes, not promises. Not financial advice.</p>
      <p>Business photos are stock images, not our customers.</p>
    </footer>
  );
}
