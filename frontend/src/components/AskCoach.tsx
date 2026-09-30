import { useEffect, useRef, useState } from "react";
import { askCoach, getAsk } from "../api";

export const EXAMPLE_QUESTIONS = ["Will my cash run out?", "Why does this happen?", "What should I watch for?"];

const POLL_EVERY_MS = 3000;
const GIVE_UP_AFTER_MS = 60_000;

interface Item {
  key: number;
  question: string;
  state: "sending" | "ready" | "error";
  answer: string;
  id?: number;
  aiStatus: string; // none | pending | done | failed
  answered: boolean;
  suggestions: string[];
  updated: boolean; // the AI's answer has replaced the instant one
  startedAt: number;
}

/** "Ask the coach" as a small chat. The answer appears at once (rule-based, from the run's facts); with an AI
 * coach a better one may replace it a little later. It never blocks: the box stays usable, polling stops after
 * a minute at most, and any failure is a one-line message with a "Try again" link. */
export function AskCoach({ runId }: { runId: number }) {
  const [question, setQuestion] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const nextKey = useRef(1);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function patch(key: number, changes: Partial<Item>) {
    if (mounted.current) setItems((all) => all.map((i) => (i.key === key ? { ...i, ...changes } : i)));
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    const key = nextKey.current++;
    setQuestion("");
    setItems((all) => [
      { key, question: text, state: "sending", answer: "", aiStatus: "none", answered: true, suggestions: [], updated: false, startedAt: Date.now() },
      ...all,
    ]);
    try {
      const res = await askCoach(runId, text);
      patch(key, {
        state: "ready", id: res.id, answer: res.answer, aiStatus: res.ai_status, answered: res.answered,
        suggestions: res.suggestions, startedAt: Date.now(),
      });
    } catch {
      patch(key, { state: "error" });
    }
  }

  function retry(item: Item) {
    setItems((all) => all.filter((i) => i.key !== item.key));
    void ask(item.question);
  }

  // Poll every 3 s for the AI's better answer; give up after a minute and keep the instant one. A failed poll is ignored.
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const anyPending = items.some((i) => i.state === "ready" && i.aiStatus === "pending");
  useEffect(() => {
    if (!anyPending) return;
    const timer = setInterval(() => {
      for (const i of itemsRef.current) {
        if (i.state !== "ready" || i.aiStatus !== "pending" || i.id === undefined) continue;
        if (Date.now() - i.startedAt > GIVE_UP_AFTER_MS) {
          patch(i.key, { aiStatus: "none" });
          continue;
        }
        getAsk(i.id).then(
          (r) => {
            if (r.ai_status === "pending") return;
            patch(i.key, {
              aiStatus: r.ai_status, answer: r.answer, answered: r.answered, suggestions: r.suggestions,
              updated: r.ai_status === "done",
            });
          },
          () => undefined,
        );
      }
    }, POLL_EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPending]);

  return (
    <div className="coach-ask">
      <h3>Ask the coach</h3>
      <div className="coach-examples" role="group" aria-label="Questions you can ask">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button key={q} type="button" className="chip-button" onClick={() => void ask(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
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
        <button type="submit" disabled={question.trim() === ""}>
          Ask
        </button>
      </form>

      <ul className="chat" aria-label="Your questions and the coach's answers" aria-live="polite">
        {items.map((item) => (
          <li key={item.key} className="chat-item">
            <p className="chat-bubble chat-q">{item.question}</p>
            {item.state === "sending" && <p className="chat-bubble chat-a chat-wait">One moment…</p>}
            {item.state === "error" && (
              <p className="chat-error" role="alert">
                We couldn't get an answer just now.{" "}
                <button type="button" className="link-button" onClick={() => retry(item)}>
                  Try again
                </button>
              </p>
            )}
            {item.state === "ready" && (
              <div className="chat-bubble chat-a">
                <p>{item.answer}</p>
                {!item.answered && item.suggestions.length > 0 && (
                  <div className="coach-examples" role="group" aria-label="Try one of these questions">
                    {item.suggestions.map((q) => (
                      <button key={q} type="button" className="chip-button" onClick={() => void ask(q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                {item.updated && <span className="coach-updated-tag">Updated with more detail</span>}
                {item.aiStatus === "pending" && (
                  <p className="coach-writing" role="status">
                    <span className="coach-dot" aria-hidden="true" />
                    Your coach is adding more detail…
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
