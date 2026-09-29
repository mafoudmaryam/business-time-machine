import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  askCoach,
  getCoachStatus,
  getScenario,
  requestCoach,
  type CoachIdea,
  type CoachOut,
  type CoachStatus,
} from "../api";
import { formatMoney } from "../lib/format";
import { buildIdeaPrefill } from "../lib/coachIdea";
import { displayScenarioName } from "../lib/scenarioLabel";
import { InfoTip } from "./InfoTip";
import { Spinner } from "./Spinner";

const MODE_LABELS: Record<string, string> = {
  template: "Rule-based coach",
  ollama: "Local AI coach",
  anthropic: "Claude coach",
};

const EXAMPLE_QUESTIONS = ["Will my cash run out?", "Why does this happen?", "What should I watch for?"];

function signedMoney(value: number, currency: string): string {
  return `${value >= 0 ? "+" : "−"}${formatMoney(Math.abs(value), currency)}`;
}

function friendlyCoachError(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) return "Your coach can't be reached right now. Is the app running?";
  return "Your coach couldn't put the notes together this time. You can still read the charts below.";
}

function IdeaCard({ idea, currency, onTry, busy }: { idea: CoachIdea; currency: string; onTry: () => void; busy: boolean }) {
  const r = idea.result;
  return (
    <li className="idea-card">
      <h4>{idea.title}</h4>
      <p>{idea.why}</p>
      <ul className="idea-decisions">
        {idea.decision_texts.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="idea-builds-on">Added to: {displayScenarioName(idea.builds_on)}</p>
      <dl className="idea-result" aria-label="Tested result">
        <div>
          <dt>
            Most likely profit vs. changing nothing <InfoTip text="We tested this idea in 1,000 possible futures. This is the middle result." />
          </dt>
          <dd>{signedMoney(r.profit_change_most_likely, currency)}</dd>
        </div>
        <div>
          <dt>Comes out ahead</dt>
          <dd>in {r.beats_change_nothing_of_10} of 10 futures</dd>
        </div>
        {r.cash_runs_out_of_10 > 0 && (
          <div>
            <dt>Cash runs out</dt>
            <dd>in {r.cash_runs_out_of_10} of 10 futures</dd>
          </div>
        )}
      </dl>
      <button type="button" onClick={onTry} disabled={busy}>
        {busy ? "Opening…" : "Try this idea"}
      </button>
    </li>
  );
}

/** The AI coach: explains a finished run in plain words. It starts working as soon as it is shown,
 * so it is usually ready by the time the owner scrolls down to it. */
export function CoachCard({ runId, businessId, currency }: { runId: number; businessId: number; currency: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [coach, setCoach] = useState<CoachOut | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tryingIdx, setTryingIdx] = useState<number | null>(null);
  const [tryError, setTryError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCoachStatus().then(
      (s) => !cancelled && setStatus(s),
      () => undefined,
    );
    requestCoach(runId).then(
      (c) => !cancelled && setCoach(c),
      (err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404 && /switched off/i.test(err.message)) setHidden(true);
        else setError(friendlyCoachError(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [runId, attempt]);

  if (hidden || (status && !status.enabled)) return null;

  function retry() {
    setError(null);
    setAttempt((n) => n + 1);
  }

  async function tryIdea(idea: CoachIdea, index: number) {
    setTryingIdx(index);
    setTryError(null);
    try {
      const parent = idea.builds_on_scenario_id ? await getScenario(idea.builds_on_scenario_id) : null;
      navigate(`/scenarios?business=${businessId}`, { state: { prefill: buildIdeaPrefill(idea, parent) } });
    } catch {
      setTryError("We couldn't open that idea. Please try again.");
      setTryingIdx(null);
    }
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      const res = await askCoach(runId, text);
      setAnswers((a) => [...a, { question: text, answer: res.answer }]);
      setQuestion("");
    } catch (err) {
      setAskError(friendlyCoachError(err));
    } finally {
      setAsking(false);
    }
  }

  const modeLabel =
    status?.mode && coach
      ? `${MODE_LABELS[coach.mode] ?? coach.mode}${coach.fallback ? " (AI unavailable, so this is the rule-based coach)" : ""}`
      : null;

  return (
    <section className="coach-card" aria-label="Your coach">
      <h2>Your coach says</h2>

      {!coach && !error && <Spinner label="Your coach is reading the results…" />}
      {error && (
        <div className="error-banner" role="alert">
          {error}{" "}
          <button type="button" className="link-button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {coach && (
        <>
          <p className="coach-headline">{coach.headline}</p>
          <p>{coach.what_happens}</p>
          <p>{coach.why}</p>

          {coach.watch_out.length > 0 && (
            <div className="coach-watch">
              <h3>Watch out</h3>
              <ul>
                {coach.watch_out.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {coach.ideas.length > 0 && (
            <>
              <h3>
                Ideas to try <InfoTip text="Each idea was tested with the same 1,000 possible futures as your scenarios. Trying one opens the scenario builder, where you confirm the details before anything is simulated." />
              </h3>
              {tryError && <div className="error-banner" role="alert">{tryError}</div>}
              <ul className="idea-grid">
                {coach.ideas.map((idea, i) => (
                  <IdeaCard
                    key={`${idea.title}-${i}`}
                    idea={idea}
                    currency={currency}
                    busy={tryingIdx === i}
                    onTry={() => tryIdea(idea, i)}
                  />
                ))}
              </ul>
            </>
          )}

          <div className="coach-ask">
            <h3>Ask the coach</h3>
            <div className="coach-examples">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button key={q} type="button" className="link-button" onClick={() => ask(q)} disabled={asking}>
                  {q}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <label htmlFor={`coach-question-${runId}`} className="visually-hidden">
                Your question
              </label>
              <input
                id={`coach-question-${runId}`}
                type="text"
                value={question}
                maxLength={500}
                placeholder="Ask about these results…"
                onChange={(e) => setQuestion(e.target.value)}
              />
              <button type="submit" disabled={asking || question.trim() === ""}>
                {asking ? "Thinking…" : "Ask"}
              </button>
            </form>
            {asking && <Spinner label="Your coach is reading the results…" />}
            {askError && <div className="error-banner" role="alert">{askError}</div>}
            {answers.map((a, i) => (
              <div key={i} className="coach-answer">
                <p className="coach-question">{a.question}</p>
                <p>{a.answer}</p>
              </div>
            ))}
          </div>

          <p className="coach-footer">
            {modeLabel && <span className="coach-mode">{modeLabel} · </span>}
            Based on simulations, not financial advice.
          </p>
        </>
      )}
    </section>
  );
}
