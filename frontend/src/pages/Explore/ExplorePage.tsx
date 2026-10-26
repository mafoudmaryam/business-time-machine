import { Link, Navigate } from "react-router-dom";
import { getRememberedBusinessId } from "../../lib/session";

const CHOICES = [
  { type: "price", title: "Prices", description: "Try a price rise with the quick slider." },
  { type: "hiring", title: "Staffing", description: "Plan to hire someone or reduce your staffing." },
  { type: "hours", title: "Opening days", description: "Try being open more or fewer days each month." },
  { type: "marketing", title: "Marketing", description: "Set a change to your monthly advertising budget." },
];

export function ExplorePage() {
  const businessId = getRememberedBusinessId();
  if (businessId === null) return <Navigate to="/" replace />;

  return (
    <div className="page explore-page">
      <h1>Try an idea</h1>
      <p>Choose a change and see what might happen. You’ll review the idea before saving a plan.</p>
      <ul className="explore-choices">
        {CHOICES.map((choice) => (
          <li key={choice.type}>
            <Link
              className="explore-choice"
              to={choice.type === "price" ? "/try" : `/scenarios?business=${businessId}&type=${choice.type}`}
              aria-labelledby={`explore-${choice.type}`}
              aria-describedby={`explore-description-${choice.type}${choice.type === "marketing" ? " explore-marketing-note" : ""}`}
            >
              <h2 id={`explore-${choice.type}`}>{choice.title}</h2>
              <p id={`explore-description-${choice.type}`}>{choice.description}</p>
              <span aria-hidden="true">Explore →</span>
            </Link>
            {choice.type === "marketing" && (
              <p id="explore-marketing-note" className="field-help">Marketing response is a rough estimate that has not been checked against real business data. Extra spending can reduce profit if it brings too few customers or you are already at capacity.</p>
            )}
          </li>
        ))}
      </ul>
      <p><Link to={`/scenarios?business=${businessId}`}>Combine changes or describe your own idea →</Link></p>
      <section className="idea-saved" aria-labelledby="idea-saved-title">
        <h2 id="idea-saved-title">Already saved an idea?</h2>
        <p><Link to={`/history?business=${businessId}`}>Open saved plans and results</Link> or <Link to={`/compare?business=${businessId}`}>compare plans side by side</Link>.</p>
      </section>
    </div>
  );
}
