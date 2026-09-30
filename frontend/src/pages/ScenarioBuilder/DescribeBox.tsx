import { useEffect, useRef, useState } from "react";
import { ApiError, getInterpretation, interpretText, type InterpretAnswer, type Interpretation } from "../../api";
import { formatMoney } from "../../lib/format";
import { MONTH_HINT } from "../../lib/interpretView";

const POLL_EVERY_MS = 1500;
const POLL_LIMIT_MS = 6 * 60 * 1000;
const MAX_LENGTH = 1000;

interface Props {
  businessId: number;
  staffNoun: string;
  currency: string;
  /** Called with every finished reading; the page puts the steps into the recipe, unconfirmed. */
  onInterpreted: (result: Interpretation) => void;
}

function friendly(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) return "I can't reach the app right now. Is it running?";
  if (err instanceof ApiError && err.status === 422) return err.message;
  return "Something went wrong while reading that. Please try again, or add the steps by hand below.";
}

/** "Describe it in your own words": the owner types, the app turns it into steps (unconfirmed) and asks about
 * anything unclear instead of guessing. The AI only translates words; every number still comes from the engine. */
export function DescribeBox({ businessId, staffNoun, currency, onInterpreted }: Props) {
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Interpretation | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const resultRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0); // ignore replies that belong to an older request (or to a business the owner left)

  useEffect(() => {
    runId.current += 1;
    setResult(null);
    setAnswers({});
    setError(null);
    setThinking(false);
    return () => {
      runId.current += 1;
    };
  }, [businessId]);

  const chips = [
    "Raise prices 5% next month",
    `Hire a part-time ${staffNoun}`,
    `Spend ${formatMoney(500, currency)} a month on Instagram`,
    "Open 6 days a week from next month",
  ];

  async function read(answerList: InterpretAnswer[]) {
    const mine = ++runId.current;
    setThinking(true);
    setError(null);
    try {
      let reply = await interpretText(businessId, text.trim(), answerList);
      const started = Date.now();
      while (reply.status === "pending") {
        if (Date.now() - started > POLL_LIMIT_MS) throw new Error("too slow");
        await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
        if (mine !== runId.current) return;
        reply = await getInterpretation(reply.id);
      }
      if (mine !== runId.current) return;
      setResult(reply);
      setAnswers({});
      onInterpreted(reply);
      setTimeout(() => resultRef.current?.focus(), 0);
    } catch (err) {
      if (mine === runId.current) setError(friendly(err));
    } finally {
      if (mine === runId.current) setThinking(false);
    }
  }

  const trimmed = text.trim();
  const filled = (result?.questions ?? []).filter((q) => (answers[q.id] ?? "").trim() !== "");

  function summary(r: Interpretation): string {
    const steps = r.decisions.filter((d) => d.role !== "end").length;
    const parts: string[] = [];
    if (steps > 0) parts.push(`I found ${steps} ${steps === 1 ? "step" : "steps"}`);
    if (r.questions.length > 0) parts.push(`${r.questions.length} ${r.questions.length === 1 ? "question needs" : "questions need"} your answer`);
    if (parts.length === 0) return r.out_of_scope ? "I couldn't turn that into a step." : "I didn't find anything to add.";
    return parts.join(", and ") + ".";
  }

  return (
    <div className="describe-box">
      <h3 id="describe-heading">Describe it in your own words</h3>
      <p className="field-help">
        Tell us what you'd like to change and when. We'll turn it into steps for you to check. Nothing runs until you
        tick each step.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !thinking) void read([]);
        }}
      >
        <label htmlFor="describe-text" className="visually-hidden">
          What would you like to change?
        </label>
        <textarea
          id="describe-text"
          rows={3}
          maxLength={MAX_LENGTH}
          value={text}
          placeholder="For example: Raise prices 10% in March and hire a baker for the summer"
          aria-describedby="describe-hint"
          onChange={(e) => setText(e.target.value)}
        />
        <p id="describe-hint" className="field-help">
          {MONTH_HINT()}
        </p>
        <div className="describe-chips" role="group" aria-label="Examples you can try">
          {chips.map((c) => (
            <button key={c} type="button" className="chip-button" onClick={() => setText(c)}>
              {c}
            </button>
          ))}
        </div>
        <button type="submit" disabled={!trimmed || thinking}>
          {thinking ? "Reading…" : "Turn this into steps"}
        </button>
      </form>

      <div role="status" aria-live="polite" className="describe-status">
        {thinking && (
          <p className="coach-writing">
            <span className="coach-dot" aria-hidden="true" />
            Reading what you wrote…
          </p>
        )}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {result && !thinking && (
        <div className="describe-result" ref={resultRef} tabIndex={-1} aria-label="What we understood">
          <p className="describe-summary" aria-live="polite">
            {summary(result)}
            {result.decisions.length > 0 && " Check each step below, change anything that's off, then tick it to confirm."}
          </p>
          {result.notes.length > 0 && (
            <ul className="describe-notes">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          {result.out_of_scope && (
            <div className="describe-scope">
              <p>{result.out_of_scope.message}</p>
              <p>Here's what I can simulate:</p>
              <ul>
                {result.out_of_scope.can_do.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {result.questions.length > 0 && (
            <form
              className="describe-questions"
              onSubmit={(e) => {
                e.preventDefault();
                if (filled.length === 0 || thinking) return;
                void read(filled.map((q) => ({ id: q.id, question: q.text, answer: answers[q.id].trim() })));
              }}
            >
              {result.questions.map((q) => {
                const id = `answer-${q.id.replace(":", "-")}`;
                return (
                  <div key={q.id} className="describe-question">
                    {q.about && <p className="decision-quote">About: “{q.about}”</p>}
                    <label htmlFor={id}>{q.text}</label>
                    {q.options && (
                      <div className="describe-chips" role="group" aria-label={`Quick answers: ${q.text}`}>
                        {q.options.map((o) => (
                          <button
                            key={o}
                            type="button"
                            className="chip-button"
                            aria-pressed={answers[q.id] === o}
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    )}
                    <input
                      id={id}
                      type="text"
                      value={answers[q.id] ?? ""}
                      placeholder={q.hint}
                      maxLength={300}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  </div>
                );
              })}
              <button type="submit" disabled={filled.length === 0 || thinking}>
                Update the steps
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
