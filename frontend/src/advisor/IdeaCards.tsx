import { useState } from "react";
import type { CoachIdea } from "../api";
import { formatMoney } from "../lib/format";
import { signed } from "../lib/formatChance";

/** The coach's suggestions, each already tested by the engine on the same possible futures. */
export function IdeaCards({
  ideas,
  currency,
  onTry,
}: {
  ideas: CoachIdea[];
  currency: string;
  onTry: (idea: CoachIdea) => Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);

  async function tryIt(idea: CoachIdea, i: number) {
    setBusy(i);
    try {
      await onTry(idea);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="ideas">
      {ideas.map((idea, i) => (
        <li key={`${idea.title}-${i}`} className="idea">
          <p className="idea-title">{idea.title}</p>
          <p className="idea-why">{idea.why}</p>
          <p className="idea-result">
            <strong className={idea.result.profit_change_most_likely >= 0 ? "up" : "down"}>
              {signed(idea.result.profit_change_most_likely, (v) => formatMoney(v, currency))}
            </strong>{" "}
            vs. keeping things as they are · ahead in {idea.result.beats_change_nothing_of_10} of 10 futures
            {idea.result.cash_runs_out_of_10 > 0 && ` · cash runs out in ${idea.result.cash_runs_out_of_10} of 10`}
          </p>
          <button type="button" className="chip" onClick={() => tryIt(idea, i)} disabled={busy !== null}>
            {busy === i ? "Opening…" : "Try this idea"}
          </button>
        </li>
      ))}
    </ul>
  );
}
