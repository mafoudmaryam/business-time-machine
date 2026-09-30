import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  askCoach,
  getCoach,
  getCoachStatus,
  getScenario,
  requestCoach,
  type CoachBar,
  type CoachIdea,
  type CoachOut,
  type CoachStatus,
  type CoachSummary,
} from "../api";
import { buildIdeaPrefill } from "../lib/coachIdea";
import { barWidths, buildTiles, signedMoney, VERDICT_CLASS, yearsText } from "../lib/coachView";
import { displayScenarioName } from "../lib/scenarioLabel";
import { ArrowRight, TrendIcon, VerdictIcon } from "./CoachIcons";
import { InfoTip } from "./InfoTip";
import { Spinner } from "./Spinner";

const MODE_LABELS: Record<string, string> = {
  template: "Rule-based coach",
  ollama: "Local AI coach",
  anthropic: "Claude coach",
};

const POLL_EVERY_MS = 3000;
const POLL_LIMIT_MS = 15 * 60 * 1000;

const EXAMPLE_QUESTIONS = ["Will my cash run out?", "Why does this happen?", "What should I watch for?"];

function friendlyCoachError(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) return "Your coach can't be reached right now. Is the app running?";
  return "Your coach couldn't put the notes together this time. You can still read the charts below.";
}

function VerdictBadge({ summary }: { summary: CoachSummary }) {
  const { key, label } = summary.verdict;
  return (
    <span className={`verdict-badge ${VERDICT_CLASS[key]}`}>
      <VerdictIcon verdict={key} />
      {label}
    </span>
  );
}

function Tiles({ summary, currency }: { summary: CoachSummary; currency: string }) {
  const later = `in ${yearsText(summary.months)}`;
  return (
    <ul className="coach-tiles" aria-label="How things change">
      {buildTiles(summary, currency).map((t) => (
        <li key={t.key} className={`coach-tile trend-${t.trend}`}>
          <span className="coach-tile-title">
            {t.title} <InfoTip text={t.tip} />
          </span>
          <span className="visually-hidden">{t.spoken}</span>
          <span className="coach-tile-values" aria-hidden="true">
            <span className="coach-tile-now">{t.now}</span>
            <ArrowRight />
            <span className="coach-tile-later">{t.later}</span>
          </span>
          <span className="coach-tile-when" aria-hidden="true">
            now → {later}
          </span>
          <span className="coach-trend" aria-hidden="true">
            <TrendIcon trend={t.trend} />
            {t.trendLabel}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WhyBars({ bars, currency }: { bars: CoachBar[]; currency: string }) {
  if (bars.length === 0) return null;
  const widths = barWidths(bars);
  return (
    <div className="coach-why">
      <h3>
        Why? <InfoTip text="Where the change in profit comes from, over the whole period. Green helps your profit, red hurts it." />
      </h3>
      <ul className="coach-bars">
        {bars.map((b, i) => {
          const helps = b.amount >= 0;
          return (
            <li key={b.key} className={helps ? "bar-helps" : "bar-hurts"}>
              <span className="bar-label">{b.label}</span>
              <span className="bar-track" aria-hidden="true">
                <span className="bar-fill" style={{ width: `${widths[i]}%` }} />
              </span>
              <span className="bar-amount">
                {signedMoney(b.amount, currency)}
                <span className="visually-hidden">{helps ? " helps" : " hurts"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function IdeaCard({ idea, currency, onTry, busy }: { idea: CoachIdea; currency: string; onTry: () => void; busy: boolean }) {
  const r = idea.result;
  const change = r.profit_change_most_likely;
  return (
    <li className="idea-card">
      <h4>{idea.title}</h4>
      <p className="idea-chips" aria-label="Tested result">
        <span className={`idea-chip ${change >= 0 ? "chip-good" : "chip-bad"}`}>
          {signedMoney(change, currency)} {change >= 0 ? "better" : "worse"}
        </span>
        <span className="idea-chip">ahead in {r.beats_change_nothing_of_10} of 10 futures</span>
        {r.cash_runs_out_of_10 > 0 && (
          <span className="idea-chip chip-bad">cash runs out in {r.cash_runs_out_of_10} of 10</span>
        )}
      </p>
      <details className="idea-more">
        <summary>Details</summary>
        <p>{idea.why}</p>
        <ul className="idea-decisions">
          {idea.decision_texts.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="idea-builds-on">Added to: {displayScenarioName(idea.builds_on)}</p>
      </details>
      <button type="button" onClick={onTry} disabled={busy} aria-label={`Try it: ${idea.title}`}>
        {busy ? (
          "Opening…"
        ) : (
          <>
            Try it <ArrowRight />
          </>
        )}
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

  // While the AI adds more detail, the rule-based coach is already on screen. When the AI version
  // arrives it fades in and gets a small "Updated with more detail" tag.
  const [updated, setUpdated] = useState(false);
  const aiPending = coach?.ai_status === "pending";

  useEffect(() => {
    let cancelled = false;
    getCoachStatus().then(
      (s) => !cancelled && setStatus(s),
      () => undefined,
    );
    requestCoach(runId).then(
      (c) => {
        if (cancelled) return;
        setCoach(c);
      },
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

  // Poll for the AI version every 3 s. A failed poll is ignored: the rule-based coach stays on screen.
  useEffect(() => {
    if (!aiPending) return;
    const started = Date.now();
    const timer = setInterval(() => {
      getCoach(runId).then(
        (c) => {
          if (c.ai_status === "pending") return;
          setCoach(c);
          if (c.ai_status === "done") setUpdated(true);
        },
        () => undefined,
      );
      if (Date.now() - started > POLL_LIMIT_MS) clearInterval(timer);
    }, POLL_EVERY_MS);
    return () => clearInterval(timer);
  }, [aiPending, runId]);

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
          {aiPending && (
            <p className="coach-writing" role="status">
              <span className="coach-dot" aria-hidden="true" />
              Your coach is adding more detail…
            </p>
          )}
          {updated && !aiPending && <span className="coach-updated-tag">Updated with more detail</span>}
          <div key={coach.generated_at} className={updated ? "coach-fade" : undefined}>
          <div className="coach-top">
            <VerdictBadge summary={coach.summary} />
            <p className="coach-headline">{coach.headline}</p>
          </div>

          <Tiles summary={coach.summary} currency={currency} />
          <WhyBars bars={coach.summary.bars} currency={currency} />

          {coach.watch_out.length > 0 && (
            <p className="coach-watch" role="note">
              <strong>Watch out:</strong> {coach.watch_out[0]}
            </p>
          )}

          <details className="coach-story">
            <summary>Read the full story</summary>
            <p>{coach.what_happens}</p>
            <p>{coach.why}</p>
          </details>

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

          </div>

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
