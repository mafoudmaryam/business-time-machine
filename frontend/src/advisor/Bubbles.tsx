import type { ReactNode } from "react";

/** The advisor's face: a little hourglass, because this is a time machine. */
export function AdvisorAvatar({ size = 36 }: { size?: number }) {
  return (
    <span className="advisor-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55}>
        <path
          d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M9.5 18.5h5l-2.5-2.5z" fill="currentColor" />
      </svg>
    </span>
  );
}

/** A message from the advisor (left side, with the avatar). `wide` is for results and forms. */
export function AdvisorBubble({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="msg msg-advisor">
      <AdvisorAvatar />
      <div className={wide ? "bubble bubble-advisor bubble-wide" : "bubble bubble-advisor"}>{children}</div>
    </div>
  );
}

/** Your answer (right side). */
export function YouBubble({ children }: { children: ReactNode }) {
  return (
    <div className="msg msg-you">
      <div className="bubble bubble-you">{children}</div>
    </div>
  );
}

/** The "…" the advisor shows while "typing" -- a short pause makes it feel like a conversation. */
export function Typing({ label = "Your advisor is typing" }: { label?: string }) {
  return (
    <div className="msg msg-advisor">
      <AdvisorAvatar />
      <div className="bubble bubble-advisor typing" role="status" aria-label={label}>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
