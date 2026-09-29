import { AdvisorBubble, Typing } from "./Bubbles";
import { retryCoach, useCoach, useCoachStatus } from "./coachStore";

const MODE_LABELS: Record<string, string> = {
  template: "Rule-based coach",
  ollama: "Local AI coach",
  anthropic: "Claude coach",
};

/** The coach's take on a run, as the advisor's next message. While the AI adds more detail
 * there's a calm line (no timer); when the AI version arrives it fades in with a small
 * "Updated with more detail" tag. Shows nothing when the coach is switched off. */
export function CoachBubble({ runId }: { runId: number }) {
  const entry = useCoach(runId);
  const status = useCoachStatus();
  const pending = entry?.coach?.ai_status === "pending";

  if (!entry || entry.state === "off" || (status && !status.enabled)) return null;
  if (entry.state === "loading") return <Typing label="Your advisor is reading the results" />;
  if (entry.state === "error") {
    return (
      <AdvisorBubble>
        <p role="alert">{entry.error}</p>
        <button type="button" className="chip" onClick={() => retryCoach(runId)}>
          Try again
        </button>
      </AdvisorBubble>
    );
  }

  const coach = entry.coach!;
  const mode =
    status?.mode &&
    `${MODE_LABELS[coach.mode] ?? coach.mode}${coach.fallback ? " (AI unavailable, so this is the rule-based coach)" : ""}`;

  return (
    <AdvisorBubble>
      {entry.updated && <span className="coach-updated-tag">Updated with more detail</span>}
      <div key={coach.generated_at} className={entry.updated ? "coach-fade" : undefined}>
        <p className="coach-headline">{coach.headline}</p>
        <p>{coach.what_happens}</p>
      </div>
      {pending && (
        <p className="coach-writing" role="status">
          <span className="coach-dot" aria-hidden="true" />
          Your advisor is adding more detail…
        </p>
      )}
      <p className="small-print">
        {mode && <span>{mode} · </span>}
        Based on simulations, not financial advice.
      </p>
    </AdvisorBubble>
  );
}
